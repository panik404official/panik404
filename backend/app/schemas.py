import json
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# Event types a browser may send. order_created / order_paid are written by the server only.
ClientEventType = Literal[
    "page_view",
    "product_view",
    "add_to_cart",
    "remove_from_cart",
    "view_cart",
    "begin_checkout",
    "booking_step",
    "gift_configure",
    "cta_click",
    "scroll_depth",
    "custom",
]
OrderStatus = Literal["pending", "paid", "failed", "cancelled", "refunded"]

Short = Annotated[str, Field(max_length=200)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---- tracking ---------------------------------------------------------------
class TrackContext(Strict):
    landing_path: str | None = Field(None, max_length=500)
    referrer: str | None = Field(None, max_length=500)
    utm_source: Short | None = None
    utm_medium: Short | None = None
    utm_campaign: Short | None = None


class TrackEvent(Strict):
    type: ClientEventType
    path: str | None = Field(None, max_length=500)
    ts: int | None = Field(None, description="client epoch milliseconds (clamped server-side)")
    props: dict[str, Any] = Field(default_factory=dict)

    @field_validator("props")
    @classmethod
    def _props_small(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(v, separators=(",", ":"))) > 2048:
            raise ValueError("props too large (max 2 KB). Never put personal or health data in props.")
        return v


class TrackBatch(Strict):
    visitor_id: UUID
    session_id: UUID
    context: TrackContext | None = None
    events: list[TrackEvent] = Field(min_length=1, max_length=50)


# ---- orders -----------------------------------------------------------------
def _lower(v):
    return str(v).lower() if v is not None else v


class CustomerIn(Strict):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str | None = Field(None, max_length=32)

    _email = field_validator("email")(_lower)


class OrderBase(Strict):
    visitor_id: UUID
    session_id: UUID
    customer: CustomerIn
    context: TrackContext | None = None


class CartItem(Strict):
    product_id: str = Field(max_length=100)
    quantity: int = Field(ge=1, le=50)


class ProductOrder(OrderBase):
    kind: Literal["product"]
    items: list[CartItem] = Field(min_length=1, max_length=20)


class GiftOrder(OrderBase):
    kind: Literal["gift"]
    quantity: int = Field(1, ge=1, le=20)
    recipient: Short | None = None
    delivery: Literal["email", "post"] = "email"
    recipient_email: EmailStr | None = None
    address: str | None = Field(None, max_length=500)
    message: str | None = Field(None, max_length=500)

    _recipient_email = field_validator("recipient_email")(_lower)


class BookingOrder(OrderBase):
    """Contact + scheduling only. Clinical screening answers are deliberately NOT accepted here."""

    kind: Literal["booking"]
    preferred_date: date | None = None
    preferred_time: str | None = Field(None, max_length=20)
    # The same moment as date + time, with the visitor's UTC offset, so the 48-hour rule uses their clock.
    preferred_at: datetime | None = None
    # Set when booking through a partner programme (e.g. #/gift-a-session/ibex): the server applies its discount.
    partner_verification_id: UUID | None = None

    @field_validator("preferred_at")
    @classmethod
    def _aware(cls, v):
        if v is not None and v.tzinfo is None:
            raise ValueError("preferred_at must include a UTC offset")
        return v


OrderIn = Annotated[Union[ProductOrder, GiftOrder, BookingOrder], Field(discriminator="kind")]


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_no: int
    status: str
    currency: str
    subtotal: Decimal
    discount: Decimal
    total: Decimal


class LeadIn(Strict):
    visitor_id: UUID
    session_id: UUID
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    team_size: int | None = Field(None, ge=1, le=100_000)
    message: str | None = Field(None, max_length=2000)
    context: TrackContext | None = None

    _email = field_validator("email")(_lower)


# ---- gift / booking requests (emailed, with the payment receipt attached) ---------------------------
# Sent as multipart form data: a JSON "data" field plus a "receipt" file. Names and prices come from the
# order (created first via POST /v1/orders), so the client cannot change what the email says was ordered.
Concern = Literal[
    "Anxiety", "Panic attacks", "Academic/work stress", "Burnout", "Low mood", "Sleep difficulties",
    "Relationship/family concerns", "Grief/loss", "Trauma", "Self-esteem", "Addiction", "Self-harm",
    "Suicidal thoughts", "Other",
]
YesNoUnsure = Literal["Yes", "No", "Not Sure"]
YesNoPrivate = Literal["Yes", "No", "Prefer Not to Say"]


class GiftRequestIn(Strict):
    order_id: UUID
    coupon: str | None = Field(None, max_length=100)


class BookingRequestIn(Strict):
    """Screening answers are emailed to the team (the user consents to this) and never stored."""

    order_id: UUID
    age: int = Field(ge=1, le=120)
    role: Literal["Student", "Corporate Employee", "Self Employed/Business Owner", "Parent", "Other"]
    concern: list[Concern] = Field(min_length=1, max_length=14)
    desc: str | None = Field(None, max_length=3000)
    duration: Literal["Less than one week", "1-4 weeks", "1-6 months", "More than 6 months", "It comes and goes"]
    distress: int = Field(ge=0, le=10)
    danger: YesNoUnsure
    suicidal: YesNoPrivate
    harm: YesNoPrivate
    medical: YesNoPrivate
    treatment: str = Field(min_length=1, max_length=3000)
    notes: str = Field(min_length=1, max_length=3000)
    consent: Literal[True]
    coupon: str | None = Field(None, max_length=100)


# ---- contact us ------------------------------------------------------------------------------------
ContactTopic = Literal["General question", "Booking", "Cancel, reschedule or refund", "Corporate wellness",
                       "Gift a session", "Other"]


class ContactIn(Strict):
    visitor_id: UUID | None = None
    session_id: UUID | None = None
    context: TrackContext | None = None
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str | None = Field(None, max_length=32)
    topic: ContactTopic = "General question"
    message: str = Field(min_length=1, max_length=4000)

    _email = field_validator("email")(_lower)


# ---- consent forms ---------------------------------------------------------------------------------
SIG_PREFIX = "data:image/png;base64,"
SIG_MAX_CHARS = 300_000  # a 600x200 PNG of a signature is usually 5-40 KB


def _sig(v):
    if v in (None, ""):
        return v
    if not isinstance(v, str) or not v.startswith(SIG_PREFIX) or len(v) > SIG_MAX_CHARS:
        raise ValueError("signature must be a PNG data URL under 300 KB")
    return v


Text = Annotated[str, Field(max_length=200)]


class ConsentData(Strict):
    """Every field of the consent form. All optional so the page can autosave one field at a time."""

    name: Text | None = None
    dob: str | None = Field(None, max_length=10)
    phone: str | None = Field(None, max_length=32)
    email: str | None = Field(None, max_length=320)
    ename: Text | None = None
    ephone: str | None = Field(None, max_length=32)
    date: str | None = Field(None, max_length=10)
    session_time: str | None = Field(None, max_length=25)
    complaint: str | None = Field(None, max_length=4000)
    ack: bool | None = None
    pname: Text | None = None
    pqual: Text | None = None
    pcnic: str | None = Field(None, max_length=20)
    gneed: bool | None = None
    gname: Text | None = None
    grel: Text | None = None
    gift: bool | None = None
    rname: Text | None = None
    rrel: Text | None = None
    rcontact: Text | None = None
    rcode: str | None = Field(None, max_length=100)
    sig_client: str | None = None
    sig_psych: str | None = None
    sig_guardian: str | None = None

    _sigs = field_validator("sig_client", "sig_psych", "sig_guardian")(_sig)


class ConsentCreate(Strict):
    note: str | None = Field(None, max_length=200)
    expires_in_days: int | None = Field(7, ge=1, le=365, description="null = never expires")
    prefill: ConsentData = Field(default_factory=ConsentData)


# ---- partner programmes ----------------------------------------------------------------------------
class PartnerVerifyIn(Strict):
    """Sent as the JSON "data" field next to the ID document file."""

    visitor_id: UUID | None = None
    session_id: UUID | None = None
    context: TrackContext | None = None
    employee_id: str = Field(min_length=1, max_length=64)


class PartnerReview(Strict):
    status: Literal["pending", "approved", "rejected"] | None = None
    admin_note: str | None = Field(None, max_length=500)


class StatusUpdate(Strict):
    status: OrderStatus
    provider: str | None = Field(None, max_length=50)
    provider_ref: str | None = Field(None, max_length=200)


class DateRange(BaseModel):
    start: datetime
    end: datetime
