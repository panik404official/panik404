"""Connect the Panik Google account once, so the API can create Google Meet links on its calendar.

    python scripts/google_auth.py --client-id XXX.apps.googleusercontent.com --client-secret YYY

(or put GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env and run it without arguments).

It opens Google's sign-in page. Sign in with the account whose calendar should hold the sessions
(e.g. panik404official@gmail.com) and allow access. The script prints GOOGLE_REFRESH_TOKEN; put it in .env.

The OAuth client must be of type "Desktop app" (Google Cloud console -> APIs & Services -> Credentials).
Standard library only: no extra packages needed.
"""
import argparse
import http.server
import json
import os
import secrets
import sys
import threading
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

SCOPE = "https://www.googleapis.com/auth/calendar.events"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"


def _env(name: str) -> str | None:
    if os.getenv(name):
        return os.getenv(name)
    env = Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            k, _, v = line.partition("=")
            if k.strip() == name:
                return v.strip().strip('"').strip("'") or None
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--client-id", default=_env("GOOGLE_CLIENT_ID"))
    ap.add_argument("--client-secret", default=_env("GOOGLE_CLIENT_SECRET"))
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    if not a.client_id or not a.client_secret:
        sys.exit("Give --client-id and --client-secret (or set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env).")

    redirect = f"http://localhost:{a.port}/"
    state = secrets.token_urlsafe(16)
    got: dict[str, str] = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            qs = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(self.path).query))
            if "code" not in qs and "error" not in qs:
                self.send_response(404)
                self.end_headers()
                return
            got.update(qs)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            msg = "Done. You can close this tab and go back to the terminal." if "code" in qs else \
                f"Google said: {qs.get('error')}. Go back to the terminal."
            self.wfile.write(f"<p style='font:16px sans-serif'>{msg}</p>".encode())
            threading.Thread(target=self.server.shutdown, daemon=True).start()

        def log_message(self, *_):
            pass

    server = http.server.HTTPServer(("127.0.0.1", a.port), Handler)
    url = AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": a.client_id, "redirect_uri": redirect, "response_type": "code", "scope": SCOPE,
        "access_type": "offline", "prompt": "consent", "state": state})
    print("Opening Google sign-in. If no browser opens, visit this address:\n\n" + url + "\n")
    webbrowser.open(url)
    server.serve_forever()

    if got.get("state") != state:
        sys.exit("The reply didn't match this sign-in (state mismatch). Run the script again.")
    if "code" not in got:
        sys.exit(f"Google refused: {got.get('error')}")
    data = urllib.parse.urlencode({"code": got["code"], "client_id": a.client_id, "client_secret": a.client_secret,
                                   "redirect_uri": redirect, "grant_type": "authorization_code"}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(TOKEN_URL, data=data), timeout=30) as r:
            tok = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Token exchange failed: {e.read().decode(errors='replace')}")
    if "refresh_token" not in tok:
        sys.exit("Google didn't return a refresh token. Remove the app's access at "
                 "https://myaccount.google.com/permissions and run this again.")
    print("Connected. Add these lines to backend/.env and restart the API:\n")
    print(f"GOOGLE_CLIENT_ID={a.client_id}")
    print(f"GOOGLE_CLIENT_SECRET={a.client_secret}")
    print(f"GOOGLE_REFRESH_TOKEN={tok['refresh_token']}")


if __name__ == "__main__":
    main()
