import { useState, useEffect, useRef } from 'react';
import Link from '../components/Link';
import { P, SORTS, sortFn } from '../data/products';
import { fmt } from '../utils/format';

export default function Shop({ sort, add }) {
  const l = [...P].sort(sortFn[sort] || sortFn['']);
  return (
    <>
      <h1>Shop</h1>
      <p>Showing all {l.length} results</p>
      <div className="tabs">
        {SORTS.map(([k, n]) => (
          <Link key={k} to={'/shop' + (k ? '/' + k : '')} className={k === sort ? 'on' : ''}>
            {n}
          </Link>
        ))}
      </div>
      <div className="grid">
        {l.map((p) => (
          <div className="card" key={p.id}>
            <Link to={'/shop/product/' + p.id}>
              <img className="pimg" src={p.img} alt={p.name} />
            </Link>
            <div className="tag">journal</div>
            <h3>
              <Link to={'/shop/product/' + p.id}>{p.name}</Link>
            </h3>
            <div className="price">{fmt(p.price).replace('Rs', '₨')}</div>
            <p style={{ color: 'var(--mute)' }}>★ {p.rate}</p>
            <div className="row">
              <button className="btn pu" onClick={() => add(p)}>
                Add to cart
              </button>
              <Link className="btn ghost" to={'/shop/product/' + p.id}>
                View
              </Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
