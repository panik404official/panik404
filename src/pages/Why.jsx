import { useState, useEffect, useRef } from 'react';
import Link from '../components/Link';

const WHY = [
  [
    'We match. You don’t browse.',
    'Instead of asking you to become an expert in therapist profiles, approaches, and credentials, Panik uses the information you provide to guide the matching.',
  ],
  [
    'Licensed means licensed.',
    'The person providing your therapy should be a licensed professional. That distinction matters.',
  ],
  ['Human language, not textbook language.', 'Clear, respectful communication is part of the experience.'],
  [
    'Built around starting.',
    'Pages, buttons, products, and information should make the journey simpler — not give you more homework.',
  ],
  [
    'Support beyond one session.',
    'Wellness tools and journals give you a place to reflect between sessions, without pretending a product can replace therapy.',
  ],
  [
    'Still allowed to have a personality.',
    'The brand doesn’t have to be cold. Panik stays warm, modern, and relatable while keeping the actual care professional.',
  ],
];
const FAQ = [
  [
    'Do I choose my therapist myself?',
    'No — you tell us what you need and Panik matches you with a licensed professional.',
  ],
  ['Are the professionals licensed?', 'Yes. Licensed means licensed.'],
  [
    'Is a journal a replacement for therapy?',
    'No. Journals give you a place to reflect between sessions; they don’t replace professional care.',
  ],
  [
    'What if I do not know exactly what is wrong?',
    'That’s fine. Start with what is going on for you — you don’t need the perfect words.',
  ],
];
export default function Why() {
  return (
    <>
      <span className="tag">Why Panik</span>
      <h1>Therapy should feel human before it feels clinical.</h1>
      <p>
        Panik is built for people who want professional mental-health support without the confusing
        directories, intimidating language, or pressure to figure everything out alone.
      </p>
      <h2 style={{ marginTop: 30 }}>Professional care. Less unnecessary friction.</h2>
      <div className="grid">
        {WHY.map(([a, b], i) => (
          <div className="card" key={a}>
            <div className="num">0{i + 1}</div>
            <h3 style={{ fontSize: '1.2rem' }}>{a}</h3>
            <p>{b}</p>
          </div>
        ))}
      </div>
      <h2 style={{ marginTop: 30 }}>How Panik works</h2>
      <div className="grid">
        {[
          'Tell us what you need help with.',
          'Panik matches you with a licensed professional.',
          'You begin your session.',
        ].map((t, i) => (
          <div className="card" key={t} style={{ boxShadow: '0 12px 32px rgba(255,210,63,.3)' }}>
            <div className="num">0{i + 1}</div>
            <b>{t}</b>
          </div>
        ))}
      </div>
      <div className="grid" style={{ marginTop: 30 }}>
        <div className="card">
          <span className="tag">Professional</span>
          <h3>Relatable branding is not a replacement for real care.</h3>
          <p>
            The tone can be warm and culturally familiar, but the person you speak to should still be a
            licensed professional.
          </p>
        </div>
        <div className="card">
          <span className="tag">Human</span>
          <h3>You do not need to “have it bad enough”.</h3>
          <p>
            Talk through stress, relationships, work, patterns, or simply the fact that your brain has had too
            many tabs open for too long.
          </p>
        </div>
      </div>
      <h2 style={{ marginTop: 30 }}>Common questions</h2>
      {FAQ.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
      <div className="card" style={{ marginTop: 30, textAlign: 'center' }}>
        <h2>You don’t need to figure it all out before you begin.</h2>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn" to="/book-a-session">
            Book a session
          </Link>
          <Link className="btn ghost" to="/shop">
            Shop wellness tools
          </Link>
        </div>
      </div>
    </>
  );
}
