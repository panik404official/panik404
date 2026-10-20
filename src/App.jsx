import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, useLocation, useParams } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import Shop from './pages/Shop';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Why from './pages/Why';
import Gift from './pages/Gift';
import Book from './pages/Book';
import Corporate from './pages/Corporate';
import { track, trackPageView } from './utils/tracker';

// Loaded only when someone opens #/admin, so shoppers never download the admin code.
const AdminApp = lazy(() => import('./admin/AdminApp'));

function ShopRoute({ add }) {
  const { sort } = useParams();
  return <Shop sort={sort || ''} add={add} />;
}

function ProductRoute({ add }) {
  const { id } = useParams();
  return <Product id={id} add={add} />;
}

export default function App() {
  const [cart, setCart] = useState([]);
  const { pathname } = useLocation();
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  useEffect(() => {
    if (!isAdmin) trackPageView(pathname); // admin browsing must not pollute customer analytics
  }, [pathname, isAdmin]);
  const add = (x) => {
    track('add_to_cart', { product_id: x.id });
    setCart((c) =>
      c.find((i) => i.id === x.id)
        ? c.map((i) => (i.id === x.id ? { ...i, q: i.q + 1 } : i))
        : [...c, { id: x.id, name: x.name, price: x.price, q: 1 }],
    );
  };
  const count = cart.reduce((s, c) => s + c.q, 0);

  if (isAdmin)
    return (
      <Suspense fallback={<p style={{ padding: 24 }}>Loading admin…</p>}>
        <AdminApp />
      </Suspense>
    );

  return (
    <>
      <ScrollToTop />
      <Header cartCount={count} />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<ShopRoute add={add} />} />
          <Route path="/shop/product/:id" element={<ProductRoute add={add} />} />
          <Route path="/shop/:sort" element={<ShopRoute add={add} />} />
          <Route path="/why-us" element={<Why />} />
          <Route path="/gift-a-session" element={<Gift />} />
          <Route path="/book-a-session" element={<Book />} />
          <Route path="/cart" element={<Cart cart={cart} setCart={setCart} />} />
          <Route path="/corporate" element={<Corporate />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
