import { useRef, useState } from 'react';
import { PaymentInstructions, ReceiptUpload, checkReceipt } from './Payment';
import { BOOKING_PRICE, checkPreferred, earliest, formatWhen, minBookingDate, preferredMoment } from '../utils/booking';
import { createOrder, sendBookingRequest, track } from '../utils/tracker';
import { isValidEmail } from '../utils/validation';

/* Booking — 6 steps */
const CONC = [
  'Anxiety',
  'Panic attacks',
  'Academic/work stress',
  'Burnout',
  'Low mood',
  'Sleep difficulties',
  'Relationship/family concerns',
  'Grief/loss',
  'Trauma',
  'Self-esteem',
  'Addiction',
  'Self-harm',
  'Suicidal thoughts',
  'Other',
];
const YN = ['Yes', 'No', 'Not Sure'],
  YP = ['Yes', 'No', 'Prefer Not to Say'];
/**
 * The 6-page booking form. Used by #/book-a-session and by partner pages such as #/gift-a-session/ibex.
 * partner: { name, discountPct, verificationId } turns on the partner price and hides the coupon field.
 * prefill: initial values for page 1 (name, email, phone, role).
 */
export default function BookingForm({ partner = null, prefill = {}, onDone }) {
  const price = partner ? BOOKING_PRICE - Math.round((BOOKING_PRICE * partner.discountPct) / 100) : BOOKING_PRICE;
  const [s, setS] = useState(1),
    [f, setF] = useState({ role: 'Student', distress: 1, concern: [], ampm: 'AM', ...prefill }),
    [er, setEr] = useState({}),
    [done, setDone] = useState(false),
    [sending, setSending] = useState(false),
    [submitError, setSubmitError] = useState('');
  const idemKey = useRef(null);
  const set = (k, v) => setF({ ...f, [k]: v }),
    req = {
      1: ['name', 'email', 'phone', 'age'],
      2: ['concern', 'duration'],
      3: ['danger', 'suicidal', 'harm', 'medical', 'treatment'],
      4: ['date', 'notes', 'consent'],
      5: [],
      6: ['file'],
    };
  const next = async () => {
    const m = {};
    req[s].forEach((k) => {
      const v = f[k];
      if (!v || (Array.isArray(v) && !v.length)) m[k] = 'This field is required.';
      else if (k === 'email' && !isValidEmail(v)) m[k] = 'Enter a valid email address.';
      else if (k === 'age' && !(Number.isInteger(+v) && +v >= 1 && +v <= 120)) m[k] = 'Enter your age in years.';
      else if (k === 'file' && checkReceipt(v)) m[k] = checkReceipt(v);
    });
    if (s === 4) {
      const when = checkPreferred(f.date, f.hh, f.mm, f.ampm);
      if (when) m[f.date ? 'time' : 'date'] = when;
    }
    setEr(m);
    if (Object.keys(m).length) return;
    if (s !== 6) {
      track('booking_step', { step: s + 1 });
      setS(s + 1);
      return;
    }

    setSending(true);
    setSubmitError('');
    try {
      // The order holds contact and scheduling only; screening answers are emailed, never stored.
      idemKey.current ??= crypto.randomUUID();
      const order = await createOrder(
        {
          kind: 'booking',
          customer: { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() },
          preferred_date: f.date,
          preferred_time: `${+f.hh}:${String(+f.mm).padStart(2, '0')} ${f.ampm}`,
          preferred_at: preferredMoment(f.date, f.hh, f.mm, f.ampm).toISOString(),
          ...(partner ? { partner_verification_id: partner.verificationId } : {}),
        },
        idemKey.current,
      );
      await sendBookingRequest(
        order.id,
        {
          age: +f.age,
          role: f.role,
          concern: f.concern,
          desc: f.desc?.trim() || null,
          duration: f.duration,
          distress: f.distress,
          danger: f.danger,
          suicidal: f.suicidal,
          harm: f.harm,
          medical: f.medical,
          treatment: f.treatment.trim(),
          notes: f.notes.trim(),
          consent: true,
          coupon: partner ? null : f.coupon?.trim() || null,
        },
        f.file,
      );
      setDone(true);
      onDone?.();
    } catch (error) {
      setSubmitError(error.message || 'Unable to submit your booking request. Please try again.');
    } finally {
      setSending(false);
    }
  };
  const In = (k, label, p = {}) => {
    const emailError =
      k === 'email' && f.email && !isValidEmail(f.email) ? 'Enter a valid email address.' : '';
    const fieldError = emailError || (k === 'email' && f.email ? '' : er[k]);
    return (
      <>
        <label>{label}</label>
        <input
          value={f[k] || ''}
          onChange={(e) => {
            set(k, e.target.value);
            if (k === 'email') setSubmitError('');
          }}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? `${k}-error` : undefined}
          {...p}
        />
        {fieldError && (
          <div className="err" id={`${k}-error`} role={k === 'email' ? 'alert' : undefined}>
            {fieldError}
          </div>
        )}
      </>
    );
  };
  const Sel = (k, label, o) => (
    <>
      <label>{label}</label>
      <select value={f[k] || ''} onChange={(e) => set(k, e.target.value)}>
        <option value="">Please select an option</option>
        {o.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      {er[k] && <div className="err">{er[k]}</div>}
    </>
  );
  return (
    <>
      {done ? (
        <div className="card" style={{ marginTop: 20 }}>
          <h2>Thank you!</h2>
          <p>
            We’ve emailed you a confirmation. We’ll schedule your consultation once your payment
            {partner ? ` and ${partner.name} ID` : ''} {partner ? 'are' : 'is'} verified.
          </p>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 20 }}>
          <b>Page {s} of 6</b>
          <div className="bar">
            <i style={{ width: (s / 6) * 100 + '%' }} />
          </div>
          {s === 1 && (
            <>
              {In('name', 'Name *')}
              {In('email', 'Email Address *', { type: 'email' })}
              {In('phone', 'Phone Number/Whatsapp *', { type: 'tel' })}
              {In('age', 'Age *', { type: 'number' })}
              {Sel('role', 'I am a', [
                'Student',
                'Corporate Employee',
                'Self Employed/Business Owner',
                'Parent',
                'Other',
              ])}
              <label>Session Mode</label>
              <input readOnly value="Online via Google Meet" />
            </>
          )}
          {s === 2 && (
            <>
              <label>What would you like support with? *</label>
              <div className="chips">
                {CONC.map((c) => (
                  <span
                    key={c}
                    className={'chip' + (f.concern.includes(c) ? ' on' : '')}
                    onClick={() =>
                      set(
                        'concern',
                        f.concern.includes(c) ? f.concern.filter((x) => x !== c) : [...f.concern, c],
                      )
                    }
                  >
                    {c}
                  </span>
                ))}
              </div>
              {er.concern && <div className="err">{er.concern}</div>}
              <label>Describe what is happening</label>
              <textarea rows="3" value={f.desc || ''} onChange={(e) => set('desc', e.target.value)} />
              {Sel('duration', 'How long has this been happening?', [
                'Less than one week',
                '1-4 weeks',
                '1-6 months',
                'More than 6 months',
                'It comes and goes',
              ])}
              <label>Distress level: 0–10 * ({f.distress})</label>
              <input
                type="range"
                min="0"
                max="10"
                value={f.distress}
                onChange={(e) => set('distress', +e.target.value)}
              />
            </>
          )}
          {s === 3 && (
            <>
              {Sel('danger', 'Immediate danger right now? *', YN)}
              {Sel('suicidal', 'Current suicidal thoughts or concern you may act on them? *', YP)}
              {Sel('harm', 'Recent self-harm or unable to stay safe? *', YP)}
              {Sel(
                'medical',
                'Seizure, loss of consciousness, severe confusion, chest pain, breathing difficulty, or another medical emergency? *',
                YP,
              )}
              <label>Current medical or psychological treatment *</label>
              <textarea
                rows="3"
                value={f.treatment || ''}
                onChange={(e) => set('treatment', e.target.value)}
              />
              {er.treatment && <div className="err">{er.treatment}</div>}
            </>
          )}
          {s === 4 && (
            <>
              {In('date', 'Preferred date *', { type: 'date', min: minBookingDate() })}
              <small className="field-hint">
                Sessions need 48 hours’ notice. The earliest you can choose is {formatWhen(earliest())}.
              </small>
              <label>Preferred time *</label>
              <div className="row">
                <input
                  style={{ width: 90 }}
                  type="number"
                  min="1"
                  max="12"
                  placeholder="Hours"
                  value={f.hh || ''}
                  aria-label="Hours"
                  aria-invalid={Boolean(er.time)}
                  onChange={(e) => set('hh', e.target.value)}
                />
                <input
                  style={{ width: 90 }}
                  type="number"
                  min="0"
                  max="59"
                  placeholder="Minutes"
                  value={f.mm ?? ''}
                  aria-label="Minutes"
                  aria-invalid={Boolean(er.time)}
                  onChange={(e) => set('mm', e.target.value)}
                />
                <select
                  style={{ width: 90 }}
                  value={f.ampm}
                  aria-label="AM or PM"
                  onChange={(e) => set('ampm', e.target.value)}
                >
                  <option>AM</option>
                  <option>PM</option>
                </select>
              </div>
              {er.time && (
                <div className="err" role="alert">
                  {er.time}
                </div>
              )}
              <label>Alternative date/time or notes *</label>
              <textarea rows="3" value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} />
              {er.notes && <div className="err">{er.notes}</div>}
              <label>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={!!f.consent}
                  onChange={(e) => set('consent', e.target.checked)}
                />{' '}
                Consent * — I consent to Panik404 contacting me about this request and understand that this
                form is not an emergency service. I understand that my booking and health-related answers
                will be emailed to Panik404 for appointment coordination.
              </label>
              {er.consent && <div className="err">{er.consent}</div>}
            </>
          )}
          {s === 5 && (
            <PaymentInstructions
              idPrefix="book"
              amount={price}
              regularAmount={partner ? BOOKING_PRICE : undefined}
              showCoupon={!partner}
              purpose="your 45-minute 1-on-1 online consultation (Google Meet)"
              confirmation="Your consultation will be scheduled after your payment has been successfully verified."
              coupon={f.coupon}
              onCoupon={(v) => set('coupon', v)}
            />
          )}
          {s === 6 && (
            <ReceiptUpload
              idPrefix="book"
              file={f.file}
              onFile={(file) => {
                set('file', file);
                setEr({ ...er, file: file ? checkReceipt(file) : '' });
              }}
              error={er.file}
            />
          )}
          <div className="row sp" style={{ marginTop: 20 }}>
            {s > 1 ? (
              <button className="btn ghost" disabled={sending} onClick={() => setS(s - 1)}>
                Previous
              </button>
            ) : (
              <span />
            )}
            <button className="btn pu" disabled={sending} onClick={next}>
              {sending ? 'Sending…' : s === 6 ? 'Book A Session →' : 'Next'}
            </button>
          </div>
          {submitError && (
            <p className="err mail-status error" role="alert">
              {submitError}
            </p>
          )}
        </div>
      )}
    </>
  );
}
