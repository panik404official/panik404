# Panik — therapy site (React + Vite + three.js)

Purple/white themed site for Panik: a scroll-driven 3D story on the home page, journal shop, gift-a-session builder, corporate page and a 6-step booking form.

## Run it
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the build locally
```
Routing uses `HashRouter` and `base: './'`, so `dist/` works on any static host or folder without server rewrites.

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
  index.css                  theme (purple / white, yellow + green accents)
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
- Booking, gift checkout, cart checkout and the corporate quote form are front-end only. Wire them to your backend in `pages/Book.jsx`, `pages/Gift.jsx`, `pages/Cart.jsx` and `pages/Corporate.jsx`.
