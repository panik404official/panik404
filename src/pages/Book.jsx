import { useState, useEffect, useRef } from 'react';
import Link from '../components/Link';

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
export default function Book() {
  const [s, setS] = useState(1),
    [f, setF] = useState({ role: 'Student', distress: 1, concern: [], ampm: 'AM' }),
    [er, setEr] = useState({}),
    [done, setDone] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v }),
    req = {
      1: ['name', 'email', 'phone', 'age'],
      2: ['concern', 'duration'],
      3: ['danger', 'suicidal', 'harm', 'medical', 'treatment'],
      4: ['date', 'hh', 'mm', 'notes', 'consent'],
      5: [],
      6: ['file'],
    };
  const next = () => {
    const m = {};
    req[s].forEach((k) => {
      const v = f[k];
      if (!v || (Array.isArray(v) && !v.length)) m[k] = 'This field is required.';
    });
    setEr(m);
    if (Object.keys(m).length) return;
    if (s === 6) setDone(true);
    else setS(s + 1);
  };
  const In = (k, label, p = {}) => (
    <>
      <label>{label}</label>
      <input value={f[k] || ''} onChange={(e) => set(k, e.target.value)} {...p} />
      {er[k] && <div className="err">{er[k]}</div>}
    </>
  );
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
      <span className="tag">Booking</span>
      <h1>Let’s find you the right support.</h1>
      <p>
        Please complete this form for initial screening and appointment coordination. This is not a diagnosis
        or emergency service.
      </p>
      <div className="row">
        {[
          'Private and confidential',
          'No therapist-shopping required',
          'We’ll explain what happens next',
        ].map((t) => (
          <span className="chip on" key={t}>
            ✓ {t}
          </span>
        ))}
      </div>
      {done ? (
        <div className="card" style={{ marginTop: 20 }}>
          <h2>Thank you!</h2>
          <p>We’ll schedule your consultation once your payment is verified.</p>
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
              {In('date', 'Preferred date *', { type: 'date' })}
              <label>Preferred time *</label>
              <div className="row">
                <input
                  style={{ width: 90 }}
                  type="number"
                  min="1"
                  max="12"
                  placeholder="Hours"
                  value={f.hh || ''}
                  onChange={(e) => set('hh', e.target.value)}
                />
                <input
                  style={{ width: 90 }}
                  type="number"
                  min="0"
                  max="59"
                  placeholder="Minutes"
                  value={f.mm || ''}
                  onChange={(e) => set('mm', e.target.value)}
                />
                <select style={{ width: 90 }} value={f.ampm} onChange={(e) => set('ampm', e.target.value)}>
                  <option>AM</option>
                  <option>PM</option>
                </select>
              </div>
              {(er.hh || er.mm) && <div className="err">Please enter a time.</div>}
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
                form is not an emergency service.
              </label>
              {er.consent && <div className="err">{er.consent}</div>}
            </>
          )}
          {s === 5 && (
            <>
              {In('coupon', 'Coupon Code/Employee ID')}
              <h3 style={{ fontSize: '1.2rem' }}>Payment Instructions</h3>
              <p>
                Please transfer <b>PKR 9,995</b> for your 45-minute 1-on-1 Zoom consultation to:
              </p>
              <p>
                Account Name: PANIK
                <br />
                Account Number: 0346401103052
                <br />
                IBAN: PK33UNIL0109000401103052
                <br />
                Bank: United Bank Limited (0346)
                <br />
                SWIFT: UNILPKKA
              </p>
              <p>
                <b>Important:</b> After payment, keep a screenshot or receipt. You’ll upload it on the next
                step. Your consultation will be scheduled after your payment has been successfully verified.
              </p>
            </>
          )}
          {s === 6 && (
            <>
              <label>Please Upload Your Payment Screenshot For Confirmation *</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => set('file', e.target.files[0]?.name || '')}
              />
              {er.file && <div className="err">{er.file}</div>}
            </>
          )}
          <div className="row sp" style={{ marginTop: 20 }}>
            {s > 1 ? (
              <button className="btn ghost" onClick={() => setS(s - 1)}>
                Previous
              </button>
            ) : (
              <span />
            )}
            <button className="btn pu" onClick={next}>
              {s === 6 ? 'Book A Session →' : 'Next'}
            </button>
          </div>
        </div>
      )}
      <div className="safety">
        <b>Urgent safety notice:</b> If you are in immediate danger, have active suicidal intent, recently
        seriously harmed yourself, are having a seizure, or have another medical emergency, contact local
        emergency services or go to the nearest emergency department now. Do not wait for this form.
      </div>
    </>
  );
}
