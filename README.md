# Panik — therapy site (React + Vite + three.js)

Purple/white themed site for Panik: a scroll-driven 3D story on the home page, journal shop, gift-a-session builder, corporate page and a 6-step booking form.

## Run it
```bash
npm install
npm run dev        # http://localhost:5173
npm run server     # mail API on http://localhost:3001 (in another terminal)
npm run build      # production build in dist/
npm run preview    # serve the build locally
```
Routing uses `HashRouter` and `base: './'`, so `dist/` works on any static host or folder without server rewrites.

## Email setup
Copy `.env.example` to `.env`, then set `MAIL_USERNAME` and `MAIL_PASSWORD` to a Gmail account and a Google App Password (not the account password). Set `MAIL_FROM`, `MAIL_SERVER`, `MAIL_PORT`, and `MAIL_TLS` for the SMTP connection. The gift form notifies `ADMIN_EMAIL` and, for email delivery, the gift recipient with a PDF copy of the gift request. The booking form notifies `ADMIN_EMAIL` and sends the buyer a confirmation. `ADMIN_EMAIL` defaults to `ethancarter.signmakerz@gmail.com`.

Run `npm run server` and `npm run dev` in separate terminals for local development; Vite proxies `/api` to the mail API. In production, deploy the Node API and configure the site host to proxy `/api` requests to it. A static-only deployment will not send emails.

Booking notifications include the intake answers, including health and safety information. Restrict access to the configured Gmail mailbox and consider whether ordinary email is appropriate for storing this sensitive information.

## Routes
| Path | Page |
|---|---|
| `/` | Home: scroll story + FAQs |
| `/shop`, `/shop/popularity`, `/shop/rating`, `/shop/latest`, `/shop/price-low`, `/shop/price-high` | Shop with sort tabs |
| `/shop/product/:id` | Journal page |
| `/cart` | Cart |
| `/why-us` | Why Panik |
| `/gift-a-session` | Gift builder |
| `/book-a-session` | 6-step booking form |
| `/corporate` | Panik for work + quote form |

## Structure
```
src/
  main.jsx, App.jsx          entry, routes, cart state
  index.css                  theme and layout
  components/                Header, Footer, Logo, Link, Work, ScrollToTop
  pages/                     Home, Shop, Product, Cart, Why, Gift, Book, Corporate
  data/                      products.js (journals + sort), faqs.js
  features/story/
    Story.jsx                scroll-driven three.js scene (office -> therapy room)
    figure.js                the cel-shaded character builder
    panels.js                canvas textures for the floating tabs
  assets/                    logo + journal photos
```

## Notes
- `three` is pinned to `0.128.0` because the scene code uses APIs from that release (e.g. `LuminanceFormat`). Upgrading means replacing that gradient-map texture.
- The Story scene reads scroll progress from the `.story` wrapper height (`640vh` in `index.css`). Change that to make the story longer or shorter.
- Booking and gift requests use the Node mail API in `server/index.js`. Cart checkout and the corporate quote form are still front-end only.
