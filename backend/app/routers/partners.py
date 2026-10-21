"""Partner programmes (#/gift-a-session/<partner>).

GET  /v1/partners/{slug}          name and discount, so the page shows the server's numbers
POST /v1/partners/{slug}/verify   multipart: "data" (JSON PartnerVerifyIn) + "document" (ID card image or PDF).
                                  Saves the record and returns its id, which the booking order then sends as
                                  partner_verification_id to get the discount.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from ..config import Settings
from ..context import build_ctx
from ..models import PartnerVerification
from ..partners import PARTNERS, VERIFICATION_MAX_AGE
from ..repos.tracking import ensure_visitor_session
from ..schemas import PartnerVerifyIn
from ..security import limit
from .intake import _parse, _read_receipt

router = APIRouter(prefix="/v1/partners", tags=["partners"])


def _partner(slug: str):
    p = PARTNERS.get(slug.lower())
    if p is None:
        raise HTTPException(404, "This partner programme does not exist.")
    return p


@router.get("/{slug}")
async def partner_info(slug: str):
    p = _partner(slug)
    return {"slug": p.slug, "name": p.name, "discount_pct": p.discount_pct}


@router.post("/{slug}/verify", status_code=201, dependencies=[Depends(limit("intake"))])
async def verify(slug: str, request: Request, data: str = Form(...), document: UploadFile = File(...)):
    s: Settings = request.app.state.settings
    p = _partner(slug)
    body: PartnerVerifyIn = _parse(PartnerVerifyIn, data)
    doc = await _read_receipt(document, s.receipt_max_bytes)
    if not doc.mime.startswith("image/"):
        raise HTTPException(415, "Upload a photo of your ID card (PNG, JPG, GIF or WebP).")
    visitor_id = None
    if body.visitor_id and body.session_id:
        ctx = build_ctx(request, body.context, fallback_path=f"/gift-a-session/{p.slug}")
        await ensure_visitor_session(body.visitor_id, body.session_id, ctx, datetime.now(timezone.utc))
        visitor_id = body.visitor_id
    v = await PartnerVerification.create(
        partner=p.slug, visitor_id=visitor_id, employee_id=body.employee_id, file_name=doc.filename,
        file_mime=doc.mime, file_size=len(doc.content), file_data=doc.content)
    return {"id": str(v.id), "partner": p.slug, "partner_name": p.name, "discount_pct": p.discount_pct,
            "expires_at": v.created_at + VERIFICATION_MAX_AGE}
