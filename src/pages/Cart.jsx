import { useState, useEffect, useRef } from 'react';
import Link from '../components/Link';

export default function Cart({ cart, setCart }) {
  const tot = cart.reduce((s, c) => s + c.price * c.q, 0);
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
                  onClick={() =>
                    setCart(
                      cart.map((x) => (x.id === c.id ? { ...x, q: x.q - 1 } : x)).filter((x) => x.q > 0),
                    )
                  }
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
          <button className="btn pu">Checkout</button>
        </div>
      )}
    </>
  );
}
