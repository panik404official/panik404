import { useEffect, useRef, useState } from 'react';
import { PaymentInstructions, ReceiptUpload, checkReceipt } from './Payment';
import { fmt } from '../utils/format';
import { couponOff } from '../utils/tracker';

/* Payment + receipt steps for a gift, shown over the gift builder so the live preview stays in view.
   onSubmit({ coupon, receipt }) must create the order, send the request and resolve with the order. */
export default function GiftCheckoutDialog({ open, amount, sessions, who, onSubmit, onClose, onDone }) {
  const ref = useRef(null);
  const [step, setStep] = useState(1),
    [coupon, setCoupon] = useState(null), // the applied coupon from the server
    [receipt, setReceipt] = useState(null),
    [receiptError, setReceiptError] = useState(''),
    [sending, setSending] = useState(false),
    [submitError, setSubmitError] = useState(''),
    [order, setOrder] = useState(null);

  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) {
      setStep(1);
      setReceipt(null);
      setReceiptError('');
      setSubmitError('');
      setOrder(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    if (sending) return;
    if (order) onDone();
    onClose();
  };

  const submit = async () => {
    const error = checkReceipt(receipt);
    setReceiptError(error);
    if (error) return;
    setSending(true);
    setSubmitError('');
    try {
      setOrder(await onSubmit({ coupon: coupon?.code || null, receipt }));
      setStep(3);
    } catch (e) {
      setSubmitError(e.message || 'Unable to send the gift request. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className="checkout-dialog"
      aria-labelledby="gift-checkout-title"
      onCancel={(e) => {
        e.preventDefault(); // Esc: route through close() so it is blocked while sending
        close();
      }}
      onClick={(e) => e.target === ref.current && close()}
    >
      <div className="checkout-dialog-body">
        <div className="row sp">
          <span className="tag">{step === 3 ? 'done' : `step ${step} of 2`}</span>
          <button type="button" className="checkout-close" aria-label="Close" onClick={close} disabled={sending}>
            ×
          </button>
        </div>
        <h2 id="gift-checkout-title">
          {step === 1 ? 'Pay for the gift' : step === 2 ? 'Upload your receipt' : 'Gift request sent'}
        </h2>
        {step < 3 && (
          <>
            <div className="bar">
              <i style={{ width: step * 50 + '%' }} />
            </div>
            <p className="checkout-summary">
              {sessions} session{sessions > 1 ? 's' : ''} for <b>{who.trim() || 'your friend'}</b> ·{' '}
              <b>{fmt(amount - couponOff(coupon, amount))}</b>
              {coupon && <> ({coupon.code})</>}
            </p>
          </>
        )}

        {step === 1 && (
          <PaymentInstructions
            idPrefix="gift"
            amount={amount}
            kind="gift"
            purpose={`${sessions} gift session${sessions > 1 ? 's' : ''}`}
            confirmation="The gift will be confirmed once your payment has been verified."
            coupon={coupon}
            onCoupon={setCoupon}
          />
        )}
        {step === 2 && (
          <ReceiptUpload
            idPrefix="gift"
            file={receipt}
            onFile={(file) => {
              setReceipt(file);
              setReceiptError(file ? checkReceipt(file) : '');
              setSubmitError('');
            }}
            error={receiptError}
          />
        )}
        {step === 3 && order && (
          <>
            <p>
              Your gift order <b>#{order.order_no}</b> for <b>{fmt(Number(order.total))}</b> is in. We’ve sent
              your receipt to our team and will confirm the gift once the payment is verified.
            </p>
            <div className="row" style={{ marginTop: 16 }}>
              <button type="button" className="btn pu" onClick={close}>
                Done
              </button>
            </div>
          </>
        )}

        {step < 3 && (
          <div className="row sp" style={{ marginTop: 20 }}>
            {step === 2 ? (
              <button type="button" className="btn ghost" disabled={sending} onClick={() => setStep(1)}>
                Previous
              </button>
            ) : (
              <button type="button" className="btn ghost" onClick={close}>
                Back to gift
              </button>
            )}
            <button
              type="button"
              className="btn pu"
              disabled={sending}
              onClick={step === 1 ? () => setStep(2) : submit}
            >
              {step === 1 ? 'Next' : sending ? 'Sending…' : 'Send gift request →'}
            </button>
          </div>
        )}
        {submitError && (
          <p className="err mail-status error" role="alert">
            {submitError}
          </p>
        )}
      </div>
    </dialog>
  );
}
