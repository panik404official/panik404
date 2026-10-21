import { useState } from 'react';
import Link from '../components/Link';
import { CONTACT_EMAIL } from '../data/terms';
import { sendContact } from '../utils/tracker';
import { isValidEmail } from '../utils/validation';

const TOPICS = [
  'General question',
  'Booking',
  'Cancel, reschedule or refund',
  'Corporate wellness',
  'Gift a session',
  'Other',
];
const EMPTY = { name: '', email: '', phone: '', topic: TOPICS[0], message: '' };

export default function Contact() {
  const [f, setF] = useState(EMPTY),
    [er, setEr] = useState({}),
    [sending, setSending] = useState(false),
    [sentTo, setSentTo] = useState(''),
    [submitError, setSubmitError] = useState('');
  const set = (k, v) => {
    setF({ ...f, [k]: v });
    if (er[k]) setEr({ ...er, [k]: '' });
  };

  const submit = async (e) => {
    e.preventDefault();
    const m = {};
    if (!f.name.trim()) m.name = 'Enter your name.';
    if (!isValidEmail(f.email)) m.email = 'Enter a valid email address so we can reply.';
    if (!f.message.trim()) m.message = 'Write a message.';
    setEr(m);
    if (Object.keys(m).length) return;
    setSending(true);
    setSubmitError('');
    try {
      await sendContact({
        name: f.name.trim(),
        email: f.email.trim(),
        phone: f.phone.trim() || null,
        topic: f.topic,
        message: f.message.trim(),
      });
      setSentTo(f.email.trim());
      setF(EMPTY);
    } catch (error) {
      setSubmitError(error.message || 'Your message was not sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const err = (k) =>
    er[k] && (
      <div className="err" id={`contact-${k}-error`}>
        {er[k]}
      </div>
    );

  return (
    <>
      <span className="tag">Contact</span>
      <h1>Talk to a real person.</h1>
      <p className="contact-lede">
        Questions about a session, a gift, a refund or a programme for your team: send them here and we’ll reply
        by email.
      </p>
      <div className="contact-layout">
        <div className="card">
          {sentTo ? (
            <div role="status">
              <h2>Message sent.</h2>
              <p>
                We’ve emailed a copy to <b>{sentTo}</b> and will reply to that address.
              </p>
              <button className="btn ghost" onClick={() => setSentTo('')}>
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <label htmlFor="contact-name">Name *</label>
              <input
                id="contact-name"
                autoComplete="name"
                maxLength={120}
                value={f.name}
                aria-invalid={Boolean(er.name)}
                aria-describedby={er.name ? 'contact-name-error' : undefined}
                onChange={(e) => set('name', e.target.value)}
              />
              {err('name')}
              <label htmlFor="contact-email">Email *</label>
              <input
                id="contact-email"
                type="email"
                autoComplete="email"
                maxLength={254}
                value={f.email}
                aria-invalid={Boolean(er.email)}
                aria-describedby={er.email ? 'contact-email-error' : undefined}
                onChange={(e) => set('email', e.target.value)}
              />
              {err('email')}
              <label htmlFor="contact-phone">Phone or WhatsApp (optional)</label>
              <input
                id="contact-phone"
                type="tel"
                autoComplete="tel"
                maxLength={32}
                value={f.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
              <label htmlFor="contact-topic">What is it about?</label>
              <select id="contact-topic" value={f.topic} onChange={(e) => set('topic', e.target.value)}>
                {TOPICS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <label htmlFor="contact-message">Message *</label>
              <textarea
                id="contact-message"
                rows="5"
                maxLength={4000}
                value={f.message}
                aria-invalid={Boolean(er.message)}
                aria-describedby={er.message ? 'contact-message-error' : undefined}
                onChange={(e) => set('message', e.target.value)}
              />
              {err('message')}
              <p className="contact-fine">
                For a booking change, include your name and appointment date. See our{' '}
                <Link to="/terms">terms</Link> for cancellation and refund notice periods.
              </p>
              <button className="btn" type="submit" disabled={sending}>
                {sending ? 'Sending…' : 'Send message'}
              </button>
              {submitError && (
                <p className="err mail-status error" role="alert">
                  {submitError}
                </p>
              )}
            </form>
          )}
        </div>
        <aside className="contact-aside">
          <h3>Email us directly</h3>
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
          <h3>Booking a session?</h3>
          <p>
            The <Link to="/book-a-session">booking form</Link> is the fastest way to get matched with a therapist.
          </p>
          <h3>For a team or company</h3>
          <p>
            Ask for a quote on the <Link to="/corporate">corporate page</Link>.
          </p>
        </aside>
      </div>
      <div className="safety">
        <b>Panik is not an emergency service.</b> If you or someone else is in immediate danger, contact local
        emergency services or go to the nearest emergency department now. Do not wait for a reply from us.
      </div>
    </>
  );
}
