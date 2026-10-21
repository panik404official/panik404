import { fmt } from '../utils/format';

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

export function PaymentInstructions({
  amount,
  regularAmount,
  purpose,
  confirmation,
  coupon,
  onCoupon,
  idPrefix,
  showCoupon = true,
}) {
  return (
    <>
      {showCoupon && (
        <>
          <label htmlFor={`${idPrefix}-coupon`}>Coupon Code/Employee ID</label>
          <input
            id={`${idPrefix}-coupon`}
            maxLength={100}
            value={coupon || ''}
            onChange={(e) => onCoupon(e.target.value)}
          />
        </>
      )}
      <h3 style={{ fontSize: '1.2rem' }}>Payment Instructions</h3>
      <p>
        Please transfer <b>{fmt(amount)}</b>
        {regularAmount && regularAmount !== amount && (
          <>
            {' '}
            <s>{fmt(regularAmount)}</s>
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
