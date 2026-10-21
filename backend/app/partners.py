"""Partner programmes: employees of a partner company verify themselves, then book at a discount.

Add a partner here (and in frontend/src/data/partners.js) to open #/gift-a-session/<slug> for it.
The discount is applied by the server; the browser's number is only for display.
"""
from dataclasses import dataclass
from datetime import timedelta


@dataclass(frozen=True)
class Partner:
    slug: str
    name: str
    discount_pct: int


PARTNERS: dict[str, Partner] = {
    "ibex": Partner(slug="ibex", name="Ibex", discount_pct=25),
}
# A verification must be used for a booking within this time, and each one books a single session.
VERIFICATION_MAX_AGE = timedelta(days=7)
# Bookings must start at least this far in the future (checked in the browser and again here).
MIN_BOOKING_NOTICE = timedelta(hours=48)
# Small allowance for clock differences between the visitor's device and the server.
BOOKING_NOTICE_GRACE = timedelta(minutes=10)
