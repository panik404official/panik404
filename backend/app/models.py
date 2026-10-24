"""Tortoise ORM models. Column names match what the migrations create."""
from tortoise import Model, fields


class Customer(Model):
    id = fields.UUIDField(primary_key=True)
    email = fields.CharField(max_length=320, unique=True)  # always stored lower-cased
    name = fields.CharField(max_length=120, null=True)
    phone = fields.CharField(max_length=32, null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "customers"


class Visitor(Model):
    """One row per browser (id is generated client-side)."""

    id = fields.UUIDField(primary_key=True)
    customer = fields.ForeignKeyField("models.Customer", related_name="visitors",
                                      null=True, on_delete=fields.SET_NULL)
    first_seen_at = fields.DatetimeField(db_index=True)
    last_seen_at = fields.DatetimeField()
    first_landing_path = fields.CharField(max_length=500, null=True)
    first_referrer = fields.CharField(max_length=500, null=True)
    first_referrer_host = fields.CharField(max_length=255, null=True)
    first_utm_source = fields.CharField(max_length=200, null=True)
    first_utm_medium = fields.CharField(max_length=200, null=True)
    first_utm_campaign = fields.CharField(max_length=200, null=True)
    first_source = fields.CharField(max_length=255, default="direct")  # utm_source | referrer host | direct
    user_agent = fields.CharField(max_length=300, null=True)
    ip_hash = fields.CharField(max_length=64, null=True)
    country = fields.CharField(max_length=2, null=True)

    class Meta:
        table = "visitors"


class Session(Model):
    id = fields.UUIDField(primary_key=True)
    visitor = fields.ForeignKeyField("models.Visitor", related_name="sessions", on_delete=fields.CASCADE)
    started_at = fields.DatetimeField(db_index=True)
    last_seen_at = fields.DatetimeField()
    landing_path = fields.CharField(max_length=500, null=True)
    referrer = fields.CharField(max_length=500, null=True)
    referrer_host = fields.CharField(max_length=255, null=True)
    utm_source = fields.CharField(max_length=200, null=True)
    utm_medium = fields.CharField(max_length=200, null=True)
    utm_campaign = fields.CharField(max_length=200, null=True)
    user_agent = fields.CharField(max_length=300, null=True)
    ip_hash = fields.CharField(max_length=64, null=True)
    country = fields.CharField(max_length=2, null=True)

    class Meta:
        table = "sessions"


class Event(Model):
    """Append-only click-stream. The real table is RANGE-partitioned by month (see migration 0002):
    no foreign keys on purpose (cheap writes, droppable partitions)."""

    id = fields.BigIntField(primary_key=True)
    occurred_at = fields.DatetimeField()
    visitor_id = fields.UUIDField()
    session_id = fields.UUIDField()
    type = fields.CharField(max_length=32)
    path = fields.CharField(max_length=500, null=True)
    props = fields.JSONField(default=dict)
    received_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "events"


class Product(Model):
    id = fields.CharField(max_length=100, primary_key=True)
    name = fields.CharField(max_length=200)
    kind = fields.CharField(max_length=16)  # product | gift | booking
    unit_price = fields.DecimalField(max_digits=12, decimal_places=2)
    active = fields.BooleanField(default=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "products"


class Order(Model):
    id = fields.UUIDField(primary_key=True)
    order_no = fields.BigIntField(unique=True)  # from order_no_seq
    idempotency_key = fields.CharField(max_length=100, unique=True, null=True)
    visitor = fields.ForeignKeyField("models.Visitor", related_name="orders", null=True,
                                     on_delete=fields.SET_NULL)
    session = fields.ForeignKeyField("models.Session", related_name="orders", null=True,
                                     on_delete=fields.SET_NULL)
    customer = fields.ForeignKeyField("models.Customer", related_name="orders", on_delete=fields.RESTRICT)
    kind = fields.CharField(max_length=16)  # product | gift | booking
    status = fields.CharField(max_length=16, default="pending", db_index=True)
    currency = fields.CharField(max_length=3, default="PKR")
    subtotal = fields.DecimalField(max_digits=12, decimal_places=2)
    discount = fields.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = fields.DecimalField(max_digits=12, decimal_places=2)
    details = fields.JSONField(default=dict)
    created_at = fields.DatetimeField(auto_now_add=True, db_index=True)
    paid_at = fields.DatetimeField(null=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "orders"


class OrderItem(Model):
    id = fields.BigIntField(primary_key=True)
    order = fields.ForeignKeyField("models.Order", related_name="items", on_delete=fields.CASCADE)
    line_no = fields.SmallIntField()
    product = fields.ForeignKeyField("models.Product", related_name="order_items", on_delete=fields.RESTRICT)
    name = fields.CharField(max_length=200)
    unit_price = fields.DecimalField(max_digits=12, decimal_places=2)
    quantity = fields.IntField()

    class Meta:
        table = "order_items"
        unique_together = (("order", "line_no"),)


class Payment(Model):
    id = fields.UUIDField(primary_key=True)
    order = fields.ForeignKeyField("models.Order", related_name="payments", on_delete=fields.CASCADE)
    provider = fields.CharField(max_length=50)
    provider_ref = fields.CharField(max_length=200, null=True)
    amount = fields.DecimalField(max_digits=12, decimal_places=2)
    status = fields.CharField(max_length=16)
    payload = fields.JSONField(default=dict)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "payments"
        unique_together = (("provider", "provider_ref"),)


class Lead(Model):
    """Corporate quote request (a lead, not a purchase)."""

    id = fields.UUIDField(primary_key=True)
    visitor = fields.ForeignKeyField("models.Visitor", related_name="leads", null=True,
                                     on_delete=fields.SET_NULL)
    session = fields.ForeignKeyField("models.Session", related_name="leads", null=True,
                                     on_delete=fields.SET_NULL)
    kind = fields.CharField(max_length=32, default="corporate")
    name = fields.CharField(max_length=120)
    email = fields.CharField(max_length=320)
    team_size = fields.IntField(null=True)
    message = fields.TextField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True, db_index=True)

    class Meta:
        table = "leads"


class ContactMessage(Model):
    """A message sent from the Contact us page (emailed to the team, kept here for the admin panel)."""

    id = fields.UUIDField(primary_key=True)
    visitor = fields.ForeignKeyField("models.Visitor", related_name="contact_messages", null=True,
                                     on_delete=fields.SET_NULL)
    name = fields.CharField(max_length=120)
    email = fields.CharField(max_length=320)
    phone = fields.CharField(max_length=32, null=True)
    topic = fields.CharField(max_length=40)
    message = fields.TextField()
    created_at = fields.DatetimeField(auto_now_add=True, db_index=True)

    class Meta:
        table = "contact_messages"


class ConsentForm(Model):
    """An informed-consent form opened through a private link that an admin generates.

    Everything typed into the form (including drawn signatures) is autosaved into `data`, so whoever opens
    the same link next sees the fields already filled. A revoked or expired link no longer opens.
    status: open (client filling) -> submitted (client pressed Save) -> completed (assigned psychologist signed),
    or revoked by an admin at any time. An admin assigns the psychologist, before or after the client saves.
    """

    id = fields.UUIDField(primary_key=True)
    token = fields.CharField(max_length=64, unique=True)
    status = fields.CharField(max_length=16, default="open", db_index=True)
    note = fields.CharField(max_length=200, null=True)  # admin-only label, e.g. "Sara, 2 Nov session"
    data = fields.JSONField(default=dict)
    reference = fields.CharField(max_length=32, null=True)
    created_at = fields.DatetimeField(auto_now_add=True, db_index=True)
    updated_at = fields.DatetimeField(auto_now=True)
    expires_at = fields.DatetimeField(null=True)
    first_opened_at = fields.DatetimeField(null=True)
    last_opened_at = fields.DatetimeField(null=True)
    completed_at = fields.DatetimeField(null=True)
    revoked_at = fields.DatetimeField(null=True)
    emailed_at = fields.DatetimeField(null=True)
    submitted_at = fields.DatetimeField(null=True)
    assigned_to = fields.ForeignKeyField("models.User", related_name="assigned_consent_forms", null=True,
                                         on_delete=fields.SET_NULL)
    assigned_by = fields.ForeignKeyField("models.User", related_name="consent_assignments_made", null=True,
                                         on_delete=fields.SET_NULL)
    assigned_at = fields.DatetimeField(null=True)

    class Meta:
        table = "consent_forms"


class PartnerVerification(Model):
    """A partner employee's ID number and ID card photo, uploaded before the discounted booking form opens.
    Name, email and phone come from the booking (the order's customer).

    status: pending (waiting for the team to check the ID) -> approved | rejected.
    `order` is set once the discounted booking is placed; each verification books one session.
    """

    id = fields.UUIDField(primary_key=True)
    partner = fields.CharField(max_length=32, db_index=True)
    status = fields.CharField(max_length=16, default="pending", db_index=True)
    visitor = fields.ForeignKeyField("models.Visitor", related_name="partner_verifications", null=True,
                                     on_delete=fields.SET_NULL)
    employee_id = fields.CharField(max_length=64)
    file_name = fields.CharField(max_length=120)
    file_mime = fields.CharField(max_length=64)
    file_size = fields.IntField()
    file_data = fields.BinaryField()
    order = fields.OneToOneField("models.Order", related_name="partner_verification", null=True,
                                 on_delete=fields.SET_NULL)
    used_at = fields.DatetimeField(null=True)
    admin_note = fields.CharField(max_length=500, null=True)
    reviewed_at = fields.DatetimeField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True, db_index=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "partner_verifications"



class User(Model):
    """Someone who signs in to the admin panel. role "admin" can do everything (including managing users);
    role "psychologist" only reaches the sections listed in `permissions` (see app/auth.py PERMISSIONS)."""

    id = fields.UUIDField(primary_key=True)
    username = fields.CharField(max_length=40, unique=True)  # stored lower-case
    email = fields.CharField(max_length=320, unique=True)  # stored lower-case
    name = fields.CharField(max_length=120)
    role = fields.CharField(max_length=16, default="psychologist")
    permissions = fields.JSONField(default=list)
    qualification = fields.CharField(max_length=120, null=True)
    password_hash = fields.CharField(max_length=255)
    is_active = fields.BooleanField(default=True)
    created_by = fields.ForeignKeyField("models.User", related_name="users_created", null=True,
                                        on_delete=fields.SET_NULL)
    last_login_at = fields.DatetimeField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "users"


class UserSession(Model):
    """A signed-in browser. Only a SHA-256 of the token is stored, so a database leak can't be replayed."""

    id = fields.UUIDField(primary_key=True)
    user = fields.ForeignKeyField("models.User", related_name="sessions", on_delete=fields.CASCADE)
    token_hash = fields.CharField(max_length=64, unique=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    expires_at = fields.DatetimeField(db_index=True)
    last_seen_at = fields.DatetimeField(null=True)
    user_agent = fields.CharField(max_length=200, null=True)

    class Meta:
        table = "user_sessions"


class Notification(Model):
    """An in-panel notification (the bell). Emails are sent alongside, best effort."""

    id = fields.UUIDField(primary_key=True)
    user = fields.ForeignKeyField("models.User", related_name="notifications", on_delete=fields.CASCADE)
    kind = fields.CharField(max_length=40)
    title = fields.CharField(max_length=200)
    body = fields.TextField(null=True)
    link = fields.CharField(max_length=300, null=True)  # panel route, e.g. /admin/consent/<id>
    read_at = fields.DatetimeField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True, db_index=True)

    class Meta:
        table = "notifications"


class Meeting(Model):
    """The online session for a consent form: a Google Meet link on the Panik calendar, created once the client
    has saved the form and an admin has chosen the psychologist. Both get the link by email.

    status: scheduled -> live (automatically at the start time, or when the psychologist presses Start)
            -> ended (automatically at the end time, or when the psychologist presses End); cancelled when the
            form's link is closed or an admin cancels it. After it ends, the psychologist can add feedback.
    """

    id = fields.UUIDField(primary_key=True)
    consent_form = fields.OneToOneField("models.ConsentForm", related_name="meeting", on_delete=fields.CASCADE)
    psychologist = fields.ForeignKeyField("models.User", related_name="meetings", null=True,
                                          on_delete=fields.SET_NULL)
    client_name = fields.CharField(max_length=200, null=True)
    client_email = fields.CharField(max_length=320, null=True)
    starts_at = fields.DatetimeField(db_index=True)
    ends_at = fields.DatetimeField()
    time_set_by_admin = fields.BooleanField(default=False)  # rescheduled in the panel: ignore the form's time
    status = fields.CharField(max_length=16, default="scheduled", db_index=True)
    meet_url = fields.CharField(max_length=300, null=True)
    link_source = fields.CharField(max_length=16, null=True)  # google | manual
    calendar_event_id = fields.CharField(max_length=200, null=True)
    link_error = fields.CharField(max_length=500, null=True)
    syncing_at = fields.DatetimeField(null=True)  # claim while a Google call is in flight
    invited_at = fields.DatetimeField(null=True)  # last time the client + psychologist were emailed the link
    started_at = fields.DatetimeField(null=True)
    started_how = fields.CharField(max_length=16, null=True)  # auto | manual
    ended_at = fields.DatetimeField(null=True)
    ended_how = fields.CharField(max_length=16, null=True)  # auto | manual
    cancelled_at = fields.DatetimeField(null=True)
    feedback = fields.TextField(null=True)
    feedback_at = fields.DatetimeField(null=True)
    feedback_by = fields.ForeignKeyField("models.User", related_name="meeting_feedback", null=True,
                                         on_delete=fields.SET_NULL)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "meetings"


class Coupon(Model):
    """A discount code made by an admin. Customers type it at checkout; the server checks it and takes the
    discount off the order. `uses` counts orders placed with it (an order that's cancelled gives its use back)."""

    id = fields.UUIDField(primary_key=True)
    code = fields.CharField(max_length=40, unique=True)  # stored in capitals, no spaces
    discount_type = fields.CharField(max_length=8)  # percent | amount
    value = fields.DecimalField(max_digits=12, decimal_places=2)  # 1-100 for percent, rupees for amount
    applies_to = fields.JSONField(default=list)  # order kinds: booking, gift, product
    active = fields.BooleanField(default=True)
    starts_at = fields.DatetimeField(null=True)
    expires_at = fields.DatetimeField(null=True)
    max_uses = fields.IntField(null=True)
    uses = fields.IntField(default=0)
    note = fields.CharField(max_length=200, null=True)
    created_by = fields.ForeignKeyField("models.User", related_name="coupons", null=True, on_delete=fields.SET_NULL)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "coupons"
