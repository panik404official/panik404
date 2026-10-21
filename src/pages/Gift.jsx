import { useEffect, useRef, useState } from 'react';
import GiftCheckoutDialog from '../components/GiftCheckoutDialog';
import { fmt } from '../utils/format';
import { createOrder, sendGiftRequest, track } from '../utils/tracker';
import { isValidEmail } from '../utils/validation';

const GF = [
  ['Do they have to use it?', 'Zero pressure. The voucher stays valid for six months.'],
  ['How long is the voucher valid?', 'A full six months from the day it’s sent.'],
  [
    'Can they pick their own therapist?',
    'You share what is going on through the booking form, and our team matches you with a suitable professional.',
  ],
  ['Is it confidential?', 'Completely. You gift the session — you never see what’s discussed.'],
  [
    'How does the physical card get there?',
    'Add their address at checkout and we post a printed Panik voucher with your note.',
  ],
  [
    'How does the bundle discount work?',
    'Each session is Rs 8,990. Each extra session adds 10% off the whole order, up to 50%.',
  ],
];
export default function Gift() {
  const [n, setN] = useState(1),
    [who, setWho] = useState(''),
    [how, setHow] = useState('email'),
    [to, setTo] = useState(''),
    [msg, setMsg] = useState(''),
    [checkoutOpen, setCheckoutOpen] = useState(false),
    [sendStatus, setSendStatus] = useState(null),
    [buyer, setBuyer] = useState({ name: '', email: '' });
  // Reuse the key on retries of the same gift; any edit makes it a new order.
  const idemKey = useRef(null);
  useEffect(() => {
    idemKey.current = null;
  }, [n, who, how, to, msg, buyer]);
  const pct = Math.min(50, (n - 1) * 10),
    tot = 8990 * n * (1 - pct / 100),
    save = 9950 * n - tot,
    emailError = how === 'email' && to.length > 0 && !isValidEmail(to)
      ? 'Enter a valid email address.'
      : '';
  const submitGift = (event) => {
    event.preventDefault();
    if (how === 'email' && !isValidEmail(to)) {
      setSendStatus({ type: 'error', text: 'Enter a valid recipient email address.' });
      return;
    }
    if (!isValidEmail(buyer.email)) {
      setSendStatus({ type: 'error', text: 'Enter a valid email address for yourself.' });
      return;
    }
    track('gift_configure', { sessions: n, delivery: how });
    setSendStatus(null);
    setCheckoutOpen(true);
  };
  const placeGift = async ({ coupon, receipt }) => {
    idemKey.current ??= crypto.randomUUID();
    const order = await createOrder(
      {
        kind: 'gift',
        customer: { name: buyer.name.trim(), email: buyer.email.trim() },
        quantity: n,
        recipient: who.trim(),
        delivery: how,
        ...(how === 'email' ? { recipient_email: to.trim() } : { address: to.trim() }),
        message: msg.trim().slice(0, 500) || null,
      },
      idemKey.current,
    );
    await sendGiftRequest(order.id, { coupon }, receipt);
    return order;
  };
  // After a successful request, start fresh so the same gift is not sent twice.
  const resetGift = () => {
    setN(1);
    setWho('');
    setTo('');
    setMsg('');
    setSendStatus({
      type: 'success',
      text: how === 'email' ? 'Gift request sent. Check your recipient’s inbox.' : 'Gift request sent.',
    });
  };
  return (
    <>
      <div className="tag">brain://gift</div>
      <h1>Gift a friend a few closed tabs.</h1>
      <p>
        One therapy session, wrapped as a gift, sent to their inbox or posted to their door. No pressure, no
        awkward conversation. Just a quiet “I’ve got you.” <b>Valid 6 months from purchase.</b>
      </p>
      <div className="grid">
        <div className="card voucher">
          <b>Gift Voucher</b>
          <p>
            Take time for you. Redeem this voucher for a therapy session to refresh, recharge, and feel alive
            from within.
          </p>
          <h2>
            Rs 8,990 <s style={{ fontSize: '1rem' }}>Rs 9,950</s>
          </h2>
          <small>limited-time gift price · licensed professionals · confidential · redeemed online</small>
        </div>
        <div className="card">
          <h3>Some gifts collect dust. This one listens back.</h3>
          <p>
            You can’t fix someone’s hard week with a mug or a candle. But you can hand them a real
            conversation with a licensed professional.
          </p>
        </div>
      </div>
      <div className="grid" style={{ marginTop: 20 }}>
        <div className="card">
          <span className="tag">instant</span>
          <h3>Send by email</h3>
          <p>
            Arrives in their inbox with your name on it. Send now or schedule it. Personal message, exact send
            date & time, unique redeem code.
          </p>
        </div>
        <div className="card">
          <span className="tag">physical</span>
          <h3>Mail a printed card</h3>
          <p>
            A real voucher card, posted to their address. Printed voucher + envelope, handwritten-style note,
            shipped anywhere.
          </p>
        </div>
      </div>
      <h2 style={{ marginTop: 30 }}>Three steps. Done.</h2>
      <div className="grid">
        {[
          ['Pick delivery', 'Email for instant, post for something they can hold.'],
          ['Add a note', 'Write a line, pick who it’s for, choose when it lands.'],
          ['They redeem', 'Their code unlocks a session with a licensed therapist.'],
        ].map(([a, b], i) => (
          <div className="card" key={a}>
            <div className="num">0{i + 1}</div>
            <b>{a}</b>
            <p>{b}</p>
          </div>
        ))}
      </div>
      <section className="gift-builder" aria-labelledby="gift-builder-title">
        <div className="gift-builder-heading">
          <span className="gift-eyebrow">build the gift</span>
          <h2 id="gift-builder-title">Make it theirs.</h2>
        </div>
        <div className="gift-builder-layout">
          <form className="gift-form" onSubmit={submitGift}>
            <label htmlFor="gift-recipient">Who’s it for?</label>
            <input
              id="gift-recipient"
              required
              maxLength={100}
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="e.g. Ayesha"
            />

            <label>How many sessions?</label>
            <div className="gift-quantity">
              <div className="gift-stepper" aria-label="Number of sessions">
                <button
                  type="button"
                  aria-label="Remove one session"
                  onClick={() => setN(Math.max(1, n - 1))}
                  disabled={n === 1}
                >
                  −
                </button>
                <b aria-live="polite">{n}</b>
                <button
                  type="button"
                  aria-label="Add one session"
                  onClick={() => setN(Math.min(6, n + 1))}
                  disabled={n === 6}
                >
                  +
                </button>
              </div>
              <span className="gift-price-pill">
                {n === 1 ? 'gift price' : `${pct}% off`} · save {fmt(save)}
              </span>
            </div>
            <div className="gift-tiers" aria-label="Bundle discount tiers">
              {Array.from({ length: 6 }, (_, i) => {
                const count = i + 1;
                return (
                  <button
                    type="button"
                    key={count}
                    className={n === count ? 'selected' : ''}
                    aria-pressed={n === count}
                    onClick={() => setN(count)}
                  >
                    {count} · {count === 1 ? 'gift price' : `${(count - 1) * 10}% off`}
                  </button>
                );
              })}
            </div>

            <label>How should it arrive?</label>
            <div className="gift-delivery" role="group" aria-label="Delivery method">
              {[
                ['email', 'By email'],
                ['post', 'By post'],
              ].map(([key, title]) => (
                <button
                  type="button"
                  key={key}
                  className={how === key ? 'selected' : ''}
                  aria-pressed={how === key}
                  onClick={() => setHow(key)}
                >
                  {title}
                </button>
              ))}
            </div>

            <label htmlFor="gift-delivery-address">
              {how === 'email' ? 'Their email' : 'Their address'}
            </label>
            <input
              id="gift-delivery-address"
              type={how === 'email' ? 'email' : 'text'}
              required
              maxLength={how === 'email' ? 254 : 500}
              minLength={how === 'post' ? 8 : undefined}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? 'gift-email-error' : undefined}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setSendStatus(null);
              }}
              placeholder={how === 'email' ? 'friend@email.com' : 'Street, city, postal code'}
            />
            {emailError && (
              <div className="err" id="gift-email-error" role="alert">
                {emailError}
              </div>
            )}

            <label htmlFor="gift-message">Your message</label>
            <textarea
              id="gift-message"
              rows="3"
              maxLength={500}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
            />

            <label htmlFor="gift-buyer-name">Your name</label>
            <input
              id="gift-buyer-name"
              required
              maxLength={120}
              value={buyer.name}
              onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
            />
            <label htmlFor="gift-buyer-email">Your email</label>
            <input
              id="gift-buyer-email"
              type="email"
              required
              maxLength={254}
              value={buyer.email}
              onChange={(e) => {
                setBuyer({ ...buyer, email: e.target.value });
                setSendStatus(null);
              }}
              placeholder="so we can confirm payment with you"
            />

            <div className="gift-total">
              <div className="gift-total-line">
                <span>
                  {n} session{n > 1 ? 's' : ''} × {fmt(8990)}
                </span>
                <span>{fmt(tot)}</span>
              </div>
              <div className="gift-total-line gift-total-grand">
                <b>Total today</b>
                <b>{fmt(tot)}</b>
              </div>
              <small>
                you save {fmt(save)} vs regular {fmt(9950 * n)}
              </small>
            </div>
            <button type="submit" className="gift-continue">
              Continue
            </button>
            {sendStatus && (
              <p className={`mail-status ${sendStatus.type}`} role="status">
                {sendStatus.text}
              </p>
            )}
          </form>

          <aside className="gift-preview" aria-label="Live voucher preview">
            <div className="gift-voucher">
              <small>
                TO · {n} SESSION{n > 1 ? 'S' : ''}
              </small>
              <b className="gift-voucher-name">{who.trim() || 'your friend'}</b>
              <p>{msg || 'Your personal message goes here.'}</p>
              <strong>{fmt(tot)}</strong>
              <span className="gift-voucher-person" aria-hidden="true" />
              <small className="gift-voucher-delivery">VIA {how.toUpperCase()}</small>
            </div>
            <p className="gift-preview-caption">live preview — updates as you type</p>
          </aside>
        </div>
      </section>
      <GiftCheckoutDialog
        open={checkoutOpen}
        amount={tot}
        sessions={n}
        who={who}
        onSubmit={placeGift}
        onClose={() => setCheckoutOpen(false)}
        onDone={resetGift}
      />
      <h2 style={{ marginTop: 30 }}>Good questions.</h2>
      {GF.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
      <div className="card" style={{ marginTop: 30, textAlign: 'center' }}>
        <h2>Give someone permission to feel better.</h2>
        <p>The limited-time gift price won’t stick around.</p>
        <a className="btn" href="#/gift-a-session">
          Gift a session now
        </a>
      </div>
    </>
  );
}
