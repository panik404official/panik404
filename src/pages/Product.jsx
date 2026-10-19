import { useState, useEffect, useRef } from 'react';
import Link from '../components/Link';
import { P } from '../data/products';
import { track } from '../utils/tracker';

export default function Product({ id, add }) {
  const p = P.find((x) => x.id === id);
  useEffect(() => {
    if (p) track('product_view', { product_id: p.id });
  }, [p?.id]);
  if (!p) return <p>Not found.</p>;
  return (
    <>
      <Link to="/shop">← Back to shop</Link>
      <div className="card" style={{ marginTop: 14 }}>
        <img className="pimg" style={{ maxWidth: 380 }} src={p.img} alt={p.name} />
        <h1>{p.name}</h1>
        <div className="price">₨ {p.price.toLocaleString()}</div>
        <button className="btn pu" onClick={() => add(p)}>
          Add to cart
        </button>
        <h2 style={{ marginTop: 24 }}>{p.hook}</h2>
        {p.body.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </div>
    </>
  );
}
