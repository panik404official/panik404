import { useState, useEffect, useRef } from 'react';
import Link from '../components/Link';
import { createOrder, track } from '../utils/tracker';
import { isValidEmail } from '../utils/validation';

export default function Cart({ cart, setCart }) {
  const tot = cart.reduce((s, c) => s + c.price * c.q, 0);
  const [checkingOut, setCheckingOut] = useState(false),
    [customer, setCustomer] = useState({ name: '', email: '', phone: '' }),
    [er, setEr] = useState({}),
    [sending, setSending] = useState(false),
    [submitError, setSubmitError] = useState(''),
    [order, setOrder] = useState(null);
  // One key per checkout attempt: retries of the same cart must not create a second order.
  const idemKey = useRef(null);
  useEffect(() => {
    idemKey.current = null;
  }, [cart]);
  useEffect(() => {
    track('view_cart', { items: cart.length });
  }, []);

  const set = (k, v) => setCustomer({ ...customer, [k]: v });
  const startCheckout = () => {
    track('begin_checkout', { items: cart.length, total: tot });
    setCheckingOut(true);
  };
  const placeOrder = async () => {
    const m = {};
    if (!customer.name.trim()) m.name = 'This field is required.';
    if (!isValidEmail(customer.email)) m.email = 'Enter a valid email address.';
    if (!customer.phone.trim()) m.phone = 'This field is required.';
    setEr(m);
    if (Object.keys(m).length) return;

    idemKey.current ??= crypto.randomUUID();
    setSending(true);
    setSubmitError('');
    try {
      const result = await createOrder(
        {
          kind: 'product',
          customer: {
            name: customer.name.trim(),
            email: customer.email.trim(),
            phone: customer.phone.trim(),
          },
          items: cart.map((c) => ({ product_id: c.id, quantity: c.q })),
        },
        idemKey.current,
      );
      setOrder(result);
      setCart([]);
    } catch (error) {
      setSubmitError(error.message || 'Unable to place your order. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const field = (k, label, type = 'text') => (
    <>
      <label htmlFor={`cart-${k}`}>{label}</label>
      <input
        id={`cart-${k}`}
        type={type}
        value={customer[k]}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={Boolean(er[k])}
      />
      {er[k] && <div className="err">{er[k]}</div>}
    </>
  );

  if (order) {
    return (
      <>
        <h1>Thank you!</h1>
        <div className="card">
          <p>
            Your order <b>#{order.order_no}</b> has been placed. Total:{' '}
            <b>₨ {Number(order.total).toLocaleString()}</b>.
          </p>
          <p>We’ll contact you with payment and delivery details.</p>
          <Link to="/shop">Continue shopping</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Your cart</h1>
      {!cart.length ? (
        <p>
          Nothing here yet. <Link to="/shop">Browse the shop</Link>.
        </p>
      ) : (
        <div className="card">
          {cart.map((c) => (
            <div
              className="row sp"
              key={c.id}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}
            >
              <b>{c.name}</b>
              <span className="row">
                <button
                  className="chip"
                  onClick={() => {
                    if (c.q === 1) track('remove_from_cart', { product_id: c.id });
                    setCart(
                      cart.map((x) => (x.id === c.id ? { ...x, q: x.q - 1 } : x)).filter((x) => x.q > 0),
                    );
                  }}
                >
                  −
                </button>
                {c.q}
                <button
                  className="chip"
                  onClick={() => setCart(cart.map((x) => (x.id === c.id ? { ...x, q: x.q + 1 } : x)))}
                >
                  +
                </button>
                ₨ {(c.price * c.q).toLocaleString()}
              </span>
            </div>
          ))}
          <h3>Total: ₨ {tot.toLocaleString()}</h3>
          {checkingOut ? (
            <>
              {field('name', 'Name *')}
              {field('email', 'Email Address *', 'email')}
              {field('phone', 'Phone Number/Whatsapp *', 'tel')}
              <div style={{ marginTop: 16 }}>
                <button className="btn pu" disabled={sending} onClick={placeOrder}>
                  {sending ? 'Placing order…' : 'Place order'}
                </button>
              </div>
              {submitError && (
                <p className="err mail-status error" role="alert">
                  {submitError}
                </p>
              )}
            </>
          ) : (
            <button className="btn pu" onClick={startCheckout}>
              Checkout
            </button>
          )}
        </div>
      )}
    </>
  );
}
