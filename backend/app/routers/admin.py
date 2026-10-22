from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, Response, UploadFile

from ..repos import admin as admin_repo, analytics, consent as consent_repo, orders as orders_repo, partners as partners_repo
from ..auth import Principal, principal, require, require_panel_access
from ..notify import notify, users_who_can
from ..schemas import ConsentAssign, ConsentCreate, ConsentSign, OrderOut, PartnerReview, StatusUpdate
from .consent import send_signed_copy

# Signed in, and allowed into the section (see app/auth.py PATH_PERMISSIONS); consent forms check per form below.
router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(require_panel_access)])


def date_range(start: datetime | None = None, end: datetime | None = None) -> tuple[datetime, datetime]:
    end = end or datetime.now(timezone.utc)
    start = start or end - timedelta(days=30)
    if start >= end:
        raise HTTPException(422, "start must be before end")
    if end - start > timedelta(days=366):
        raise HTTPException(422, "range too large (max 366 days)")
    return start, end


@router.get("/orders")
async def list_orders(
    status: Literal["pending", "paid", "failed", "cancelled", "refunded"] | None = None,
    kind: Literal["product", "gift", "booking"] | None = None,
    q: str | None = Query(None, max_length=200, description="email, name, phone or order number"),
    before: datetime | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    rows = await admin_repo.search_orders(status, kind, q, before, limit)
    return {"items": rows, "next_before": rows[-1]["created_at"] if len(rows) == limit else None}


@router.get("/orders/{order_id}")
async def order_detail(order_id: UUID):
    data = await admin_repo.order_detail(order_id)
    if data is None:
        raise HTTPException(404, "Order not found")
    return data


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
async def update_status(order_id: UUID, body: StatusUpdate):
    try:
        return await orders_repo.set_status(order_id, body.status, body.provider, body.provider_ref)
    except orders_repo.OrderError as e:
        raise HTTPException(e.status_code, e.message) from e


@router.get("/visitors/{visitor_id}/journey")
async def visitor_journey(visitor_id: UUID, limit: int = Query(1000, ge=1, le=5000)):
    data = await analytics.journey(visitor_id, limit)
    if data is None:
        raise HTTPException(404, "Visitor not found")
    return data


@router.get("/analytics/funnel")
async def funnel(rng: tuple[datetime, datetime] = Depends(date_range)):
    return await analytics.funnel(*rng)


@router.get("/analytics/sources")
async def sources(rng: tuple[datetime, datetime] = Depends(date_range)):
    return {"items": await analytics.sources(*rng)}


# ---- admin panel ---------------------------------------------------------------------------------------
@router.get("/overview")
async def overview():
    return await admin_repo.overview()


@router.get("/customers")
async def list_customers(
    q: str | None = Query(None, max_length=200, description="email, name or phone"),
    sort: Literal["recent", "spent", "orders", "last_seen", "name"] = "recent",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await admin_repo.list_customers(q, sort, limit, offset)


@router.get("/customers/{customer_id}")
async def customer_profile(customer_id: UUID, event_limit: int = Query(2000, ge=1, le=10000)):
    data = await admin_repo.customer_profile(customer_id, event_limit)
    if data is None:
        raise HTTPException(404, "Customer not found")
    return data


@router.get("/visitors")
async def list_visitors(
    identified: bool | None = None,
    q: str | None = Query(None, max_length=200),
    before: datetime | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    rows = await admin_repo.list_visitors(identified, q, before, limit)
    return {"items": rows, "next_before": rows[-1]["last_seen_at"] if len(rows) == limit else None}


@router.get("/leads")
async def list_leads(q: str | None = Query(None, max_length=200), before: datetime | None = None,
                     limit: int = Query(50, ge=1, le=200)):
    rows = await admin_repo.list_leads(q, before, limit)
    return {"items": rows, "next_before": rows[-1]["created_at"] if len(rows) == limit else None}


@router.get("/events")
async def live_events(type: str | None = Query(None, max_length=32), before: datetime | None = None,
                      limit: int = Query(100, ge=1, le=500)):
    rows = await admin_repo.live_events(type, before, limit)
    return {"items": rows, "next_before": rows[-1]["occurred_at"] if len(rows) == limit else None}


@router.get("/products")
async def products():
    return {"items": await admin_repo.products()}


@router.get("/payments")
async def payments(limit: int = Query(100, ge=1, le=500)):
    return {"items": await admin_repo.payments(limit)}


@router.get("/contact-messages")
async def contact_messages(q: str | None = Query(None, max_length=200), before: datetime | None = None,
                           limit: int = Query(50, ge=1, le=200)):
    rows = await admin_repo.list_contact_messages(q, before, limit)
    return {"items": rows, "next_before": rows[-1]["created_at"] if len(rows) == limit else None}


# ---- consent forms -------------------------------------------------------------------------------------
# consent_manage: every form, create links, assign, close, reopen.
# consent_assigned: only forms assigned to them; they can view and sign those.
def _consent_reader(request: Request) -> Principal:
    p = principal(request)
    if not (p.can("consent_manage") or p.can("consent_assigned")):
        raise HTTPException(403, "You don't have access to consent forms.")
    return p


async def _visible_form(form_id: UUID, p: Principal):
    form = await consent_repo.get(form_id)
    if form is None or (not p.can("consent_manage") and form.assigned_to_id != p.user_id):
        raise HTTPException(404, "Consent form not found")
    return form


def _consent_error(e: consent_repo.ConsentError):
    raise HTTPException(e.status_code, e.message) from e


@router.get("/consent-forms")
async def list_consent_forms(
    request: Request,
    state: Literal["open", "submitted", "completed", "expired", "revoked", "unassigned"] | None = None,
    mine: bool = False,
    q: str | None = Query(None, max_length=200), limit: int = Query(100, ge=1, le=500),
):
    p = _consent_reader(request)
    only_for = p.user_id if (mine or not p.can("consent_manage")) else None
    if only_for is None and (mine or not p.can("consent_manage")):
        return {"items": []}  # the system key has no assignments
    return {"items": await consent_repo.list_forms(state, q, limit, only_for)}


@router.post("/consent-forms", status_code=201)
async def create_consent_form(body: ConsentCreate, request: Request, background: BackgroundTasks,
                              p: Principal = Depends(require("consent_manage"))):
    try:
        form = await consent_repo.create(body, p.user_id)
    except consent_repo.ConsentError as e:
        _consent_error(e)
    if form.assigned_to_id:
        await notify(request.app.state.settings, background, [form.assigned_to], kind="consent_assigned",
                     title="A consent form was assigned to you",
                     body="A new consent form link was assigned to you. You'll be notified again when the client "
                          "has filled it in.", link=f"/admin/consent/{form.id}")
    return consent_repo.admin_row(form, full=True)


@router.get("/consent-forms/{form_id}")
async def consent_form_detail(form_id: UUID, request: Request):
    p = _consent_reader(request)
    return consent_repo.admin_row(await _visible_form(form_id, p), full=True)


@router.post("/consent-forms/{form_id}/revoke", dependencies=[Depends(require("consent_manage"))])
async def revoke_consent_form(form_id: UUID):
    """Closes the link for good: it stops opening for everyone. The saved answers stay in the database."""
    try:
        return consent_repo.admin_row(await consent_repo.revoke(form_id), full=True)
    except consent_repo.ConsentError as e:
        _consent_error(e)


@router.post("/consent-forms/{form_id}/reopen", dependencies=[Depends(require("consent_manage"))])
async def reopen_consent_form(form_id: UUID):
    try:
        return consent_repo.admin_row(await consent_repo.reopen(form_id), full=True)
    except consent_repo.ConsentError as e:
        _consent_error(e)


@router.post("/consent-forms/{form_id}/assign")
async def assign_consent_form(form_id: UUID, body: ConsentAssign, request: Request, background: BackgroundTasks,
                              p: Principal = Depends(require("consent_manage"))):
    try:
        form, assignee = await consent_repo.assign(form_id, body.user_id, p.user_id)
    except consent_repo.ConsentError as e:
        _consent_error(e)
    if assignee:
        who = (form.data or {}).get("name") or "A client"
        ready = form.status == "submitted"
        await notify(request.app.state.settings, background, [assignee], kind="consent_assigned",
                     title=f"{who}'s consent form was assigned to you",
                     body=(f"{who} has filled the consent form. Review it and add your signature."
                           if ready else f"{who} hasn't filled the form yet. You'll be notified when they save it."),
                     link=f"/admin/consent/{form.id}")
    return consent_repo.admin_row(form, full=True)


@router.post("/consent-forms/{form_id}/sign")
async def sign_consent_form(form_id: UUID, body: ConsentSign, request: Request, background: BackgroundTasks):
    """The assigned psychologist (or someone who manages consent forms) adds their part and completes the form."""
    p = _consent_reader(request)
    form = await _visible_form(form_id, p)
    if not p.can("consent_manage") and form.assigned_to_id != p.user_id:
        raise HTTPException(403, "Only the assigned psychologist can sign this form.")
    if not body.sig_psych:
        raise HTTPException(422, "Draw your signature.")
    try:
        form = await consent_repo.sign(form_id, body.model_dump())
    except consent_repo.ConsentError as e:
        _consent_error(e)
    who = (form.data or {}).get("name") or "a client"
    signer = p.user.name if p.user else "The system key"
    others = [u for u in await users_who_can("consent_manage") if u.id != p.user_id]
    await notify(request.app.state.settings, background, others, kind="consent_completed",
                 title=f"Consent form signed for {who}",
                 body=f"{signer} signed {who}'s consent form (reference {form.reference}).",
                 link=f"/admin/consent/{form.id}", email=False)
    return consent_repo.admin_row(form, full=True)


@router.post("/consent-forms/{form_id}/email")
async def email_signed_consent(form_id: UUID, request: Request, pdf: UploadFile = File(...)):
    """Multipart "pdf" built in the panel after signing: emails it to Panik and the client (once)."""
    p = _consent_reader(request)
    await _visible_form(form_id, p)
    s = request.app.state.settings
    try:
        form = await consent_repo.completed_for_email(form_id)
    except consent_repo.ConsentError as e:
        _consent_error(e)
    to = await send_signed_copy(s, form, await pdf.read(s.receipt_max_bytes + 1))
    return {"message": "Signed copy emailed.", "to": to}


# ---- partner programmes (e.g. Ibex) --------------------------------------------------------------------
@router.get("/partner-verifications")
async def list_partner_verifications(
    partner: str | None = Query(None, max_length=32),
    status: Literal["pending", "approved", "rejected"] | None = None,
    booked: bool | None = None,
    q: str | None = Query(None, max_length=200),
    limit: int = Query(100, ge=1, le=500),
):
    return {"items": await partners_repo.list_verifications(partner, status, booked, q, limit),
            **await partners_repo.counts()}


@router.get("/partner-verifications/{vid}")
async def partner_verification_detail(vid: UUID):
    data = await partners_repo.detail(vid)
    if data is None:
        raise HTTPException(404, "Verification not found")
    return data


@router.get("/partner-verifications/{vid}/file")
async def partner_verification_file(vid: UUID):
    v = await partners_repo.file(vid)
    if v is None:
        raise HTTPException(404, "Verification not found")
    return Response(bytes(v.file_data), media_type=v.file_mime, headers={
        "Content-Disposition": f'inline; filename="{v.file_name}"', "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store"})


@router.patch("/partner-verifications/{vid}")
async def review_partner_verification(vid: UUID, body: PartnerReview):
    data = await partners_repo.review(vid, body.status, body.admin_note, "admin_note" in body.model_fields_set)
    if data is None:
        raise HTTPException(404, "Verification not found")
    return data
