import { useState } from 'react';
import { fmt } from '../utils/format';
import { checkCoupon, couponOff } from '../utils/tracker';

// Shared by the booking form (steps 5–6) and the gift checkout popup.
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
const RECEIPT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];

/** Returns an error message, or '' if the file can be uploaded. The server re-checks the real file type. */
export function checkReceipt(file) {
  if (!file) return 'Please upload your payment screenshot.';
  if (file.type && !RECEIPT_TYPES.includes(file.type))
    return 'Upload an image (PNG, JPG, GIF, WebP) or a PDF.';
  if (file.size > RECEIPT_MAX_BYTES) return 'The file must be smaller than 5 MB.';
  return '';
}

/**
 * Coupon input with Apply / Remove. `coupon` is the applied coupon from the server (or null);
 * onCoupon(couponOrNull) reports changes. Only an applied coupon changes the price.
 */
export function CouponField({ kind, coupon, onCoupon, idPrefix }) {
  const [text, setText] = useState(coupon?.code || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apply = async () => {
    const code = text.trim();
    if (!code) return;
    setBusy(true);
    setError('');
    try {
      const c = await checkCoupon(code, kind);
      onCoupon(c);
      setText(c.code);
    } catch (e) {
      onCoupon(null);
      setError(e.message || 'This coupon code isn’t valid.');
    } finally {
      setBusy(false);
    }
  };
  const pending = text.trim() && text.trim().toUpperCase() !== coupon?.code;
  return (
    <>
      <label htmlFor={`${idPrefix}-coupon`}>Coupon code</label>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <input
          id={`${idPrefix}-coupon`}
          maxLength={40}
          value={text}
          autoComplete="off"
          style={{ textTransform: 'uppercase', marginBottom: 0 }}
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            }
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={`${idPrefix}-coupon-msg`}
        />
        {coupon && !pending ? (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              onCoupon(null);
              setText('');
            }}
          >
            Remove
          </button>
        ) : (
          <button type="button" className="btn ghost" disabled={busy || !text.trim()} onClick={apply}>
            {busy ? 'Checking…' : 'Apply'}
          </button>
        )}
      </div>
      <div id={`${idPrefix}-coupon-msg`} role="status" style={{ minHeight: '1.4em', marginTop: 4 }}>
        {error ? (
          <span className="err">{error}</span>
        ) : coupon && !pending ? (
          <small>
            <b>{coupon.code}</b> applied: {coupon.label}.
          </small>
        ) : pending ? (
          <small>Press Apply to use this code.</small>
        ) : null}
      </div>
    </>
  );
}

export function PaymentInstructions({
  amount,
  regularAmount,
  purpose,
  confirmation,
  kind,
  coupon,
  onCoupon,
  idPrefix,
  showCoupon = true,
}) {
  const off = showCoupon ? couponOff(coupon, amount) : 0;
  const due = amount - off;
  const was = off ? amount : regularAmount;
  return (
    <>
      {showCoupon && <CouponField kind={kind} coupon={coupon} onCoupon={onCoupon} idPrefix={idPrefix} />}
      <h3 style={{ fontSize: '1.2rem' }}>Payment Instructions</h3>
      <p>
        Please transfer <b>{fmt(due)}</b>
        {was && was !== due && (
          <>
            {' '}
            <s>{fmt(was)}</s>
          </>
        )}{' '}
        for {purpose} to:
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
        <b>Important:</b> After payment, keep a screenshot or receipt. You’ll upload it on the next step.{' '}
        {confirmation}
      </p>
    </>
  );
}

export function ReceiptUpload({ file, onFile, error, idPrefix }) {
  return (
    <>
      <label htmlFor={`${idPrefix}-receipt`}>Please Upload Your Payment Screenshot For Confirmation *</label>
      <input
        id={`${idPrefix}-receipt`}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
        onChange={(e) => onFile(e.target.files[0] || null)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${idPrefix}-receipt-error` : undefined}
      />
      {file && !error && (
        <small className="receipt-name">
          {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB
        </small>
      )}
      {error && (
        <div className="err" id={`${idPrefix}-receipt-error`} role="alert">
          {error}
        </div>
      )}
    </>
  );
}
