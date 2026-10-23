"""Payment receipts on Cloudinary, so the admin panel can show them.

Receipts are bank details, so they're uploaded as `authenticated` assets: the plain URL doesn't open, only a
URL signed with the API secret does. The panel gets a freshly signed URL with each order it loads.
Images are stored as images (Cloudinary can make thumbnails); PDFs are stored as raw files, because free
Cloudinary accounts block PDF delivery as images by default.

The Cloudinary SDK is blocking (urllib3), so uploads run in a worker thread.
"""
import asyncio
import io
import logging
from typing import Any

import cloudinary.uploader
import cloudinary.utils

from .config import Settings

log = logging.getLogger("cloud")


class StorageNotConfigured(Exception):
    pass


def _creds(s: Settings) -> dict[str, str]:
    c = s.cloudinary_creds
    if not c:
        raise StorageNotConfigured("Cloudinary is not configured")
    return {"cloud_name": c[0], "api_key": c[1], "api_secret": c[2]}


def _upload(s: Settings, content: bytes, mime: str, public_id: str) -> dict[str, Any]:
    resource_type = "raw" if mime == "application/pdf" else "image"
    r = cloudinary.uploader.upload(
        io.BytesIO(content), resource_type=resource_type, type="authenticated", folder=s.cloudinary_folder,
        public_id=public_id + (".pdf" if resource_type == "raw" else ""), overwrite=True, unique_filename=False,
        tags=["receipt"], **_creds(s))
    return {"provider": "cloudinary", "public_id": r["public_id"], "resource_type": r["resource_type"],
            "type": r.get("type", "authenticated"), "format": r.get("format"), "version": r.get("version"),
            "bytes": r.get("bytes"), "width": r.get("width"), "height": r.get("height")}


async def upload_receipt(s: Settings, content: bytes, mime: str, public_id: str) -> dict[str, Any]:
    """Stores the file and returns what's needed to sign a URL for it later. Raises StorageNotConfigured, or
    cloudinary / network errors."""
    _creds(s)
    return await asyncio.to_thread(_upload, s, content, mime, public_id)


def signed_url(s: Settings, info: dict[str, Any] | None, thumb: bool = False) -> str | None:
    """A URL the panel can open. None if there's nothing stored or Cloudinary isn't configured."""
    if not info or info.get("provider") != "cloudinary" or not s.cloudinary_creds:
        return None
    opts: dict[str, Any] = {"resource_type": info.get("resource_type", "image"),
                            "type": info.get("type", "authenticated"), "sign_url": True, "secure": True,
                            "version": info.get("version"), **_creds(s)}
    if opts["resource_type"] == "image":
        opts["format"] = info.get("format")
        if thumb:
            opts["transformation"] = [{"width": 480, "crop": "limit", "quality": "auto"}]
    try:
        return cloudinary.utils.cloudinary_url(info["public_id"], **opts)[0]
    except Exception:  # noqa: BLE001 - a bad stored record must not break the order page
        log.exception("could not sign a Cloudinary URL")
        return None
