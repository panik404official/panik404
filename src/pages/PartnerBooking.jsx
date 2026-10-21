import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import BookingForm from "../components/BookingForm";
import { PARTNERS } from "../data/partners";
import { BOOKING_PRICE } from "../utils/booking";
import { fmt } from "../utils/format";
import { getPartner, sendPartnerVerification } from "../utils/tracker";
import { isValidEmail } from "../utils/validation";
import { checkReceipt } from "../components/Payment";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const storeKey = (slug) => `pk_partner_${slug}`;

// The verification survives a reload for this tab, so a refresh doesn't send people back to the upload step.
const loadSaved = (slug) => {
  try {
    const v = JSON.parse(sessionStorage.getItem(storeKey(slug)));
    return v && new Date(v.expires_at) > new Date() ? v : null;
  } catch {
    return null;
  }
};
const save = (slug, v) => {
  try {
    if (v) sessionStorage.setItem(storeKey(slug), JSON.stringify(v));
    else sessionStorage.removeItem(storeKey(slug));
  } catch {
    /* storage blocked: the visitor just verifies again after a reload */
  }
};

function Verify({ partner, onVerified }) {
  const [employeeId, setEmployeeId] = useState(""),
    [file, setFile] = useState(null),
    [er, setEr] = useState({}),
    [sending, setSending] = useState(false),
    [submitError, setSubmitError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const m = {};
    if (!employeeId.trim())
      m.employee_id = `Enter your ${partner.name} employee ID.`;
    if (!file) m.file = `Upload a photo of your ${partner.name} ID card.`;
    else if (file.type && !IMAGE_TYPES.includes(file.type))
      m.file = "Upload an image: PNG, JPG, GIF or WebP.";
    else if (file.size > MAX_BYTES)
      m.file = "The photo must be smaller than 5 MB.";
    setEr(m);
    if (Object.keys(m).length) return;
    setSending(true);
    setSubmitError("");
    try {
      const v = await sendPartnerVerification(
        partner.slug,
        { employee_id: employeeId.trim() },
        file,
      );
      onVerified({ ...v, employeeId: employeeId.trim() });
    } catch (error) {
      setSubmitError(
        error.message || "Your details were not uploaded. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="card partner-step" onSubmit={submit} noValidate>
      <h2 className="partner-title">
        Verify your identity to move on to the next steps
      </h2>
      <label htmlFor="pv-employee-id">{partner.name} employee ID *</label>
      <input
        id="pv-employee-id"
        value={employeeId}
        maxLength={64}
        aria-invalid={Boolean(er.employee_id)}
        aria-describedby={er.employee_id ? "pv-employee-id-error" : undefined}
        onChange={(e) => {
          setEmployeeId(e.target.value);
          setEr({ ...er, employee_id: "" });
        }}
      />
      {er.employee_id && (
        <div className="err" id="pv-employee-id-error">
          {er.employee_id}
        </div>
      )}
      <label htmlFor="pv-file">Photo of your {partner.name} ID card *</label>
      <input
        id="pv-file"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        aria-invalid={Boolean(er.file)}
        aria-describedby={er.file ? "pv-file-error" : undefined}
        onChange={(e) => {
          setFile(e.target.files[0] || null);
          setEr({ ...er, file: "" });
        }}
      />
      {file && !er.file && (
        <small className="receipt-name">
          {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB
        </small>
      )}
      {er.file && (
        <div className="err" id="pv-file-error" role="alert">
          {er.file}
        </div>
      )}
      <div className="row sp" style={{ marginTop: 20 }}>
        <small className="partner-sub">
          PNG, JPG, GIF or WebP, up to 5 MB. Only the Panik team sees it.
        </small>
        <button className="btn pu" type="submit" disabled={sending}>
          {sending ? "Uploading…" : "Verify and continue"}
        </button>
      </div>
      {submitError && (
        <p className="err mail-status error" role="alert">
          {submitError}
        </p>
      )}
    </form>
  );
}

export default function PartnerBooking() {
  const { partner: slug = "" } = useParams();
  const known = PARTNERS[slug.toLowerCase()];
  const [partner, setPartner] = useState(known);
  const [verified, setVerified] = useState(() =>
    known ? loadSaved(known.slug) : null,
  );

  // Show the server's discount in case it changed since this page was built.
  useEffect(() => {
    if (!known) return;
    getPartner(known.slug)
      .then((p) =>
        setPartner({ slug: p.slug, name: p.name, discountPct: p.discount_pct }),
      )
      .catch(() => {});
  }, [known]);

  if (!known) return <Navigate to="/gift-a-session" replace />;
  const price =
    BOOKING_PRICE - Math.round((BOOKING_PRICE * partner.discountPct) / 100);

  return (
    <>
      <span className="tag">{partner.name} × Panik</span>
      <h1>
        {partner.discountPct}% off a session, for the {partner.name} team.
      </h1>
      <p>
        A 45-minute 1-on-1 online consultation for <b>{fmt(price)}</b>{" "}
        <s>{fmt(BOOKING_PRICE)}</s>. Confirm you work at {partner.name}, then
        book like anyone else. {partner.name} never sees what you discuss.
      </p>
      {verified ? (
        <>
          <p className="partner-ok" role="status">
            ✓ Identity uploaded
            {verified.employeeId ? ` (employee ID ${verified.employeeId})` : ""}
            . Now book your session.{" "}
            <button
              type="button"
              className="partner-link"
              onClick={() => {
                save(partner.slug, null);
                setVerified(null);
              }}
            >
              Not you? Start again
            </button>
          </p>
          <BookingForm
            partner={{
              name: partner.name,
              discountPct: partner.discountPct,
              verificationId: verified.id,
            }}
            prefill={{ role: "Corporate Employee" }}
            onDone={() => save(partner.slug, null)}
          />
        </>
      ) : (
        <Verify
          partner={partner}
          onVerified={(v) => {
            save(partner.slug, v);
            setVerified(v);
            window.scrollTo(0, 0);
          }}
        />
      )}
      <div className="safety">
        <b>Urgent safety notice:</b> If you are in immediate danger, have active
        suicidal intent, recently seriously harmed yourself, are having a
        seizure, or have another medical emergency, contact local emergency
        services or go to the nearest emergency department now. Do not wait for
        this form.
      </div>
    </>
  );
}
