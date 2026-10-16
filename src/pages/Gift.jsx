import { useState, useEffect, useRef } from 'react';
import Link from '../components/Link';
import { fmt } from '../utils/format';

const GF = [
  ['Do they have to use it?', 'Zero pressure. The voucher stays valid for six months.'],
  ['How long is the voucher valid?', 'A full six months from the day it’s sent.'],
  [
    'Can they pick their own therapist?',
    'Yes — they choose from our licensed professionals and a time that suits them.',
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
    [who, setWho] = useState('a friend'),
    [how, setHow] = useState('email'),
    [to, setTo] = useState(''),
    [msg, setMsg] = useState('No reason. Just thought you could use a breather.');
  const pct = Math.min(50, (n - 1) * 10),
    tot = 8990 * n * (1 - pct / 100),
    save = 9950 * n - tot;
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
      <h2 style={{ marginTop: 30 }}>Make it theirs.</h2>
      <div className="grid">
        <div className="card">
          <label>Who’s it for?</label>
          <input value={who} onChange={(e) => setWho(e.target.value)} />
          <label>How many sessions?</label>
          <div className="row">
            <button className="chip" onClick={() => setN(Math.max(1, n - 1))}>
              −
            </button>
            <b>{n}</b>
            <button className="chip" onClick={() => setN(n + 1)}>
              +
            </button>
            <small>{pct}% off</small>
          </div>
          <label>How should it arrive?</label>
          <div className="chips">
            {[
              ['email', 'By email'],
              ['post', 'By post'],
            ].map(([k, t]) => (
              <span key={k} className={'chip' + (how === k ? ' on' : '')} onClick={() => setHow(k)}>
                {t}
              </span>
            ))}
          </div>
          <label>{how === 'email' ? 'Their email' : 'Their address'}</label>
          <input value={to} onChange={(e) => setTo(e.target.value)} />
          <label>Your message</label>
          <textarea rows="3" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <p>
            {n} session × Rs 8,990 · <b>Total today {fmt(tot)}</b>
            <br />
            <small>you save {fmt(save)} vs regular Rs 9,950</small>
          </p>
          <button className="btn pu">Continue</button>
        </div>
        <div className="card voucher">
          <small>live preview</small>
          <h3>
            TO · {n} SESSION{n > 1 ? 'S' : ''}
          </h3>
          <b>{who || 'your friend'}</b>
          <p>{msg}</p>
          <h2>{fmt(tot)}</h2>
          <small>VIA {how.toUpperCase()}</small>
        </div>
      </div>
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
