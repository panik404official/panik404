# Panik API (FastAPI + Tortoise ORM + Neon Postgres)

Tracks every visitor from first page view to purchase: **visitor → session → events → customer → order → payment**.

## Run it
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                                   # fill NEON_DB_URL, ADMIN_API_KEY, IP_HASH_SECRET
tortoise -c app.tortoise_conf.TORTOISE_ORM migrate     # creates tables, partitions, seeds products
uvicorn app.main:app --reload                          # docs at /docs when ENVIRONMENT != production
pytest                                                 # needs a local Postgres, see TEST_DB_URL in tests/conftest.py
```
Changing a model? `tortoise -c app.tortoise_conf.TORTOISE_ORM makemigrations` then `migrate`.

> **Rotate your Neon password.** The connection string was pasted into a chat, so treat it as exposed
> (Neon console → Roles → reset password). It is intentionally **not** in this zip; only `.env` holds it.

## Tortoise specifics worth knowing
- Models live in `app/models.py`; migrations use Tortoise's built-in migration framework (`app/migrations`).
  `0001_initial` is auto-generated from the models. `0002_partition_events_and_seed` is hand-written (RunSQL):
  it turns `events` into a monthly **range-partitioned** table, adds retention helpers, the order-number
  sequence and the product seed. The ORM can't express partitioning, and the Event model state is unchanged, so
  `makemigrations` will not undo it. Tortoise needs a single-column pk, so the model pk is `id` while the real
  table's primary key is `(occurred_at, id)` (required for partitioning). The API only inserts and reads events.
- Neon URL handling (`app/db.py`): `sslmode=require` becomes a verified asyncpg SSL context; `channel_binding` is dropped
  (asyncpg doesn't do it and Neon doesn't require clients to); `statement_cache_size=0` keeps the pooled (PgBouncer)
  endpoint happy. Set `NEON_DB_URL_DIRECT` (non-pooler host) and the CLI will use it for migrations.
- Tortoise 1.x keeps its state in a contextvar, so `Tortoise.init(..., _enable_global_fallback=True)` is used in the
  FastAPI lifespan so request tasks can see it. Don't call `generate_schemas()`; migrations own the schema.

## Data model
| Table | Purpose |
|---|---|
| `visitors` | one row per browser (client-generated UUID), first-touch source/UTM, hashed IP, `customer_id` once identified |
| `sessions` | 30-min activity windows, landing page, referrer, UTM |
| `events` | append-only click-stream, partitioned monthly, JSONB `props` |
| `customers` | unique by (lower-cased) email; filled at checkout, which also links the visitor's earlier anonymous history |
| `orders`, `order_items`, `payments` | server-priced orders (`product` / `gift` / `booking`), status machine, payment log |
| `products` | price list (seeded from the storefront). The API never trusts client prices |
| `leads` | corporate quote requests |

## Endpoints
Public: `POST /v1/track` (batch, 202) · `POST /v1/orders` (`Idempotency-Key` header) · `POST /v1/leads` · `GET /healthz` · `GET /readyz`
Admin (`X-Admin-Key`): `GET /v1/admin/overview` · `GET /v1/admin/customers` (`q`, `sort`, `limit`, `offset`) · `GET /v1/admin/customers/{id}` (full profile) · `GET /v1/admin/orders` (`status`, `kind`, `q`) · `GET /v1/admin/orders/{id}` · `GET /v1/admin/visitors` · `GET /v1/admin/events` · `GET /v1/admin/leads` · `GET /v1/admin/products` · `GET /v1/admin/payments` · `PATCH /v1/admin/orders/{id}/status` · `GET /v1/admin/visitors/{id}/journey` · `GET /v1/admin/analytics/funnel` · `GET /v1/admin/analytics/sources`

Booking stays "pending" until you mark it `paid` (your flow verifies a bank transfer by hand). Amounts are decimal strings in PKR.

Gift / booking requests (replace the old Express `server/`): `POST /v1/gifts/request` · `POST /v1/bookings/request`.
Multipart form: `data` (JSON with `order_id` from `POST /v1/orders`, plus the screening answers for bookings) and
`receipt` (PNG/JPG/GIF/WebP/PDF, max 5 MB, type checked from the file bytes). The team gets an email with the
receipt attached (and the voucher PDF for emailed gifts); the customer / gift recipient gets a confirmation.
Recipient, totals and contact details are read from the order, not from the request. Screening answers are only
emailed, never stored. Each order can be submitted once; if email fails, nothing is marked and the user can retry.
Needs `MAIL_USERNAME` / `MAIL_PASSWORD` (Gmail app password); without them these endpoints return 503.

## Contact us and consent forms
Contact: `POST /v1/contact` (JSON: name, email, phone?, topic, message). Emails the team (reply-to = sender) and sends the
sender a copy; stored in `contact_messages`. If email fails nothing is stored, so a retry leaves no duplicate.

Consent forms (migration `0003`): an admin creates a private link (`POST /v1/admin/consent-forms`, optional pre-fill and
expiry). The site opens it at `#/consent/<token>`. Public endpoints, keyed only by the token:
`GET /v1/consent/{token}` · `PATCH /v1/consent/{token}` (autosave, changed fields only, merged atomically) ·
`POST /v1/consent/{token}/submit` (checks required fields, locks the form) · `POST /v1/consent/{token}/email`
(multipart `pdf`, emails the signed copy to `CONSENT_EMAIL` and the client, once).
Admin: `GET /v1/admin/consent-forms` (`state`, `q`) · `GET /v1/admin/consent-forms/{id}` ·
`POST /v1/admin/consent-forms/{id}/revoke` · `GET /v1/admin/contact-messages`.
A revoked or expired link returns 410 everywhere; answers stay in the database. **Consent forms store health
information** (presenting complaint) and anyone holding a link can read it until it expires or is closed, so prefer
short expiries and close links once signed.

## Partner programmes (Ibex) and the 48-hour rule
`#/gift-a-session/ibex`: the employee first uploads name, email, phone, employee ID and an ID card image/PDF
(`POST /v1/partners/ibex/verify`, multipart `data` + `document`; stored in `partner_verifications`, file included).
The 6-page booking form then opens without the coupon field. The order sends `partner_verification_id`; the server
checks it (same email, not rejected, not used, under 7 days old) and applies the partner discount (Ibex 25%:
Rs 9,995 - 2,499 = Rs 7,496). Each verification books one session. The booking email to the team carries the
partner details and attaches the ID document. Partners are configured in `app/partners.py`.
Admin: `GET /v1/admin/partner-verifications` (`status`, `booked`, `q`) · `GET .../{id}` · `GET .../{id}/file` ·
`PATCH .../{id}` (`status`: pending | approved | rejected, `admin_note`). Panel page: "Partner bookings".

All bookings must start at least 48 hours from now. The browser sends `preferred_at` (with its UTC offset) and the
server rejects anything earlier (10-minute clock allowance); without `preferred_at`, date + time are read as Pakistan time.

## Panel sign-in, users and permissions
People sign in at `#/admin` with a username or email and a password (`POST /v1/auth/login`, then
`Authorization: Bearer <token>`). On a fresh database the sign-in screen asks to create the first admin, which needs
`ADMIN_API_KEY` once (`POST /v1/auth/setup`, only works while no user exists). After that, admins create everyone
else on the Users page (`/v1/admin/users`) and choose a role:
- **admin**: everything, including users;
- **psychologist**: only the sections ticked for them (default: consent forms assigned to them). The section
  permissions live in `app/auth.py` (`PERMISSIONS`, `PATH_PERMISSIONS`); unlisted admin endpoints are admin-only.
Passwords are hashed with scrypt; only a SHA-256 of each session token is stored. Switching a user off or resetting
their password signs them out everywhere. `X-Admin-Key: <ADMIN_API_KEY>` still works as a full-access system key for
scripts and tests; keep it secret.

Notifications: `GET /v1/admin/notifications` (+ `/count`, `/{id}/read`, `/read-all`) show in the panel's bell; each
one is also emailed in the background (set `PANEL_URL` so the email links straight to the right page).

### Consent flow
1. An admin creates a link (optionally choosing the psychologist up front) and sends it to the client.
2. The client fills it (autosaved) and presses **Save** (`POST /v1/consent/{token}/submit`, status `submitted`).
   Every admin, and anyone with `consent_manage`, gets a notification + email.
3. An admin assigns a psychologist (`POST /v1/admin/consent-forms/{id}/assign`); the psychologist is notified.
   (If they were chosen up front, they're notified when the client saves.)
4. The psychologist opens it in the panel, adds name, qualification, CNIC and signature
   (`POST .../sign`, status `completed`); the panel builds the PDF and `POST .../email` sends it to `CONSENT_EMAIL`
   and the client. Admins get a notification that it was signed.
An admin can send a saved form back to the client (`POST .../reopen`) or close the link (`POST .../revoke`).

## Admin panel
Open the site at `#/admin` (e.g. `http://localhost:5173/#/admin`) and enter `ADMIN_API_KEY`. The key is kept in
sessionStorage only. Pages: overview, customers (search, sort, CSV export), a full customer profile (contact details,
lifetime value, every order with items/payments/gift and booking details, every device and visit, the complete
click-stream timeline, corporate enquiries, raw JSON download), orders (mark paid/failed/cancelled/refunded),
visitors and their journeys, live activity, leads, products and the payment log. The admin bundle is lazy-loaded and
admin page views are not tracked. Booking screening answers are not in the panel because they are never stored.

## Wire up the React site
Copy `client/tracker.js` to `src/utils/tracker.js`, set `VITE_API_URL`, then:
```jsx
// App.jsx
const { pathname } = useLocation();
useEffect(() => { trackPageView(); }, [pathname]);
// add(): track('add_to_cart', { product_id: x.id })      Product page: track('product_view', { product_id: id })
// Cart "Checkout": track('begin_checkout'); then await createOrder({ kind:'product', customer:{name,email,phone}, items:[{product_id,quantity}] })
// Gift: createOrder({ kind:'gift', customer, quantity:n, delivery:how, recipient:who, message:msg })
// Book (final step): createOrder({ kind:'booking', customer, preferred_date, preferred_time })
// Corporate: createLead({ name, email, team_size, message })
```
The cart and checkout currently have no customer form: add name/email/phone fields before calling `createOrder`.

## Privacy: please read
- The booking form collects mental-health screening answers (self-harm, suicidal thoughts, medical history). **This service does not accept or store them**: the booking order schema rejects unknown fields. Keep that data out of analytics `props` too. If you must store it, use a separate encrypted store with its own access controls.
- IPs are stored only as a keyed hash. Raw IPs never touch the database.
- Call `setTracking(false)` until the visitor consents where your jurisdiction requires it.

## Why it is fast and scales
- **Write-behind ingestion:** `/v1/track` only enqueues (no DB round-trip); one task batches visitor/session upserts plus a bulk event insert into Postgres per ~1s. Trade-off: events still in memory are lost on a hard crash. A graceful shutdown flushes the queue.
- `last_seen_at` uses server receive time, so late or skewed client clocks can't move it backwards; first-touch fields are never overwritten.
- **Monthly partitions** keep indexes small and make retention a metadata operation: `SELECT drop_event_partitions_older_than(13);`. New partitions are created automatically every 6h.
- Scale out by adding instances (stateless apart from the buffer). Keep `workers × DB_POOL_MAX` within your Neon pooler limits and add edge rate limiting (the built-in limiter is per process).
- Later, if event volume explodes: ship `events` to a warehouse; the table is append-only with no foreign keys for this reason.
