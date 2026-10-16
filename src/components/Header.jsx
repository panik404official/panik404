import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Link from './Link';
import Logo from './Logo';

export default function Header({ cartCount }) {
  const section = useLocation().pathname.split('/')[1];
  const on = (k) => (section === k ? 'on' : '');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header>
      <Link to="/" aria-label="Panik home">
        <Logo />
      </Link>
      <div className="header-actions">
        <Link
          to="/cart"
          className={`cart-link ${on('cart')}`}
          aria-label={`Cart, ${cartCount} items`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 8H6" />
            <circle cx="10" cy="21" r="1" />
            <circle cx="18" cy="21" r="1" />
          </svg>
          <span className="cart-count">{cartCount}</span>
        </Link>
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
      {menuOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <nav
        id="primary-navigation"
        className={`navigation-sidebar${menuOpen ? ' open' : ''}`}
        aria-label="Primary navigation"
      >
        <div className="sidebar-heading">
          <span>Menu</span>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
          >
            &times;
          </button>
        </div>
        <Link to="/shop" className={on('shop')} onClick={() => setMenuOpen(false)}>
          Shop
        </Link>
        <Link to="/why-us" className={on('why-us')} onClick={() => setMenuOpen(false)}>
          Why us
        </Link>
        <Link
          to="/gift-a-session"
          className={on('gift-a-session')}
          onClick={() => setMenuOpen(false)}
        >
          Gift a session
        </Link>
        <Link to="/book-a-session" className="cta" onClick={() => setMenuOpen(false)}>
          Book a session
        </Link>
      </nav>
    </header>
  );
}
