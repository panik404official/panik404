"""Signing in to the admin panel.

GET  /v1/auth/setup     {"needs_setup": true} while no user exists yet
POST /v1/auth/setup     create the first admin; needs the ADMIN_API_KEY once, then it's never needed again
POST /v1/auth/login     username or email + password -> session token
POST /v1/auth/logout    ends this sign-in
GET  /v1/auth/me        the signed-in user and their permissions
POST /v1/auth/password  change your own password (signs out your other devices)
"""
import hmac
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from tortoise.expressions import Q
from tortoise.transactions import in_transaction

from ..auth import (Principal, burn_time, current_principal, hash_password, start_session, token_hash, user_out,
                    verify_password)
from ..models import User, UserSession
from ..schemas import LoginIn, PasswordChange, SetupIn
from ..security import limit

router = APIRouter(prefix="/v1/auth", tags=["auth"])


def _signed_in(user: User, token: str, expires_hours: float) -> dict:
    return {"token": token, "expires_in": int(expires_hours * 3600), "user": user_out(user)}


@router.get("/setup")
async def setup_status():
    return {"needs_setup": not await User.exists()}


@router.post("/setup", status_code=201, dependencies=[Depends(limit("login"))])
async def setup(body: SetupIn, request: Request):
    s = request.app.state.settings
    if not hmac.compare_digest(body.admin_key.encode(), s.admin_api_key.encode()):
        raise HTTPException(401, "That is not the ADMIN_API_KEY from the backend settings.")
    async with in_transaction():
        # lock-free guard: the unique username/email and this check make a second setup fail
        if await User.exists():
            raise HTTPException(409, "The first admin already exists. Sign in instead.")
        user = await User.create(username=body.username, email=str(body.email), name=body.name, role="admin",
                                 permissions=[], password_hash=hash_password(body.password))
    token = await start_session(user, timedelta(hours=s.session_hours), request.headers.get("user-agent"))
    return _signed_in(await User.get(id=user.id), token, s.session_hours)


@router.post("/login", dependencies=[Depends(limit("login"))])
async def login(body: LoginIn, request: Request):
    s = request.app.state.settings
    who = body.login.strip().lower()
    user = await User.filter(Q(username=who) | Q(email=who)).first()
    if user is None:
        burn_time(body.password)
        raise HTTPException(401, "Wrong username/email or password.")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong username/email or password.")
    if not user.is_active:
        raise HTTPException(403, "This account is switched off. Ask an admin to turn it back on.")
    hours = s.session_remember_days * 24 if body.remember else s.session_hours
    token = await start_session(user, timedelta(hours=hours), request.headers.get("user-agent"))
    return _signed_in(await User.get(id=user.id), token, hours)


@router.post("/logout")
async def logout(request: Request, p: Principal = Depends(current_principal)):
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        await UserSession.filter(token_hash=token_hash(auth[7:].strip())).delete()
    return {"message": "Signed out."}


@router.get("/me")
async def me(p: Principal = Depends(current_principal)):
    if p.user is None:  # system key: used by scripts, not people
        return {"id": None, "username": "system", "email": None, "name": "System key", "role": "admin",
                "permissions": sorted(p.permissions), "granted": [], "qualification": None, "is_active": True}
    return user_out(p.user)


@router.post("/password")
async def change_password(body: PasswordChange, p: Principal = Depends(current_principal)):
    if p.user is None:
        raise HTTPException(400, "The system key has no password.")
    if not verify_password(body.current_password, p.user.password_hash):
        raise HTTPException(400, "Your current password is not right.")
    await User.filter(id=p.user.id).update(password_hash=hash_password(body.new_password))
    await UserSession.filter(user_id=p.user.id).exclude(id=p.session_id).delete()
    return {"message": "Password changed. Your other devices were signed out."}
