import Link from './Link';

export default function Footer() {
  return (
    <footer>
      <b style={{ fontFamily: 'Fraunces,serif', fontSize: '1.5rem' }}>PANIK</b>
      <p>Therapy should feel human before it feels clinical.</p>
      <p>
        <Link to="/shop">Shop</Link>
        <Link to="/why-us">Why us</Link>
        <Link to="/gift-a-session">Gift a session</Link>
        <Link to="/corporate">Corporate</Link>
        <Link to="/book-a-session">Book a session</Link>
        <Link to="/contact">Contact us</Link>
      </p>
      <p className="footer-legal">
        <Link to="/terms">Terms &amp; conditions</Link>
      </p>
      <small>Panik is not an emergency service. © Panik</small>
    </footer>
  );
}
