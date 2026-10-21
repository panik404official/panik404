import { useContext, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiFileUrl, AuthError } from "../api";
import { AdminCtx, useAdmin } from "../ctx";
import { Field, Loader, Status, money, when } from "../ui";
import { CheckState } from "./PartnerVerifications";

function Document({ id, name }) {
  const { logout } = useContext(AdminCtx);
  const [file, setFile] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let url;
    apiFileUrl(`/partner-verifications/${id}/file`)
      .then((f) => {
        url = f.url;
        setFile(f);
      })
      .catch((e) => {
        if (e instanceof AuthError) logout();
        setErr(e.message);
      });
    return () => url && URL.revokeObjectURL(url);
  }, [id, logout]);
  if (err) return <p className="adm-note err">{err}</p>;
  if (!file) return <p className="adm-loading">Loading document…</p>;
  return (
    <>
      <img
        className="adm-doc"
        src={file.url}
        alt={`ID card photo uploaded by the employee (${name})`}
      />
      <div className="adm-row">
        <a className="adm-btn" href={file.url} target="_blank" rel="noreferrer">
          Open full size
        </a>
        <a className="adm-btn" href={file.url} download={name}>
          Download
        </a>
      </div>
    </>
  );
}

export default function PartnerVerificationDetail() {
  const { id } = useParams();
  const {
    data: v,
    error,
    loading,
    reload,
  } = useAdmin(`/partner-verifications/${id}`);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const update = async (body, what) => {
    setBusy(what);
    setErr("");
    try {
      await api(`/partner-verifications/${id}`, { method: "PATCH", body });
      setNote(null);
      reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <Loader error={error} loading={loading} onRetry={reload}>
      {v && (
        <>
          <p className="adm-crumb">
            <Link to="/admin/partners">Partner bookings</Link>
          </p>
          <header className="adm-head">
            <div>
              <h1>
                {v.name || `Employee ${v.employee_id}`}{" "}
                <CheckState value={v.status} />
              </h1>
              <p className="adm-sub">
                {v.partner_name} employee {v.employee_id} · submitted{" "}
                {when(v.created_at)}
              </p>
            </div>
            <div className="adm-head-actions">
              {v.status !== "approved" && (
                <button
                  className="adm-btn primary"
                  disabled={!!busy}
                  onClick={() => update({ status: "approved" }, "approve")}
                >
                  {busy === "approve" ? "Saving…" : "Approve ID"}
                </button>
              )}
              {v.status !== "rejected" && (
                <button
                  className="adm-btn danger"
                  disabled={!!busy}
                  onClick={() =>
                    confirm(
                      v.order
                        ? "Reject this ID? The booking stays as it is; cancel or refund it on the order page if needed."
                        : "Reject this ID? They will not be able to book with it.",
                    ) && update({ status: "rejected" }, "reject")
                  }
                >
                  {busy === "reject" ? "Saving…" : "Reject ID"}
                </button>
              )}
              {v.status !== "pending" && (
                <button
                  className="adm-btn"
                  disabled={!!busy}
                  onClick={() => update({ status: "pending" }, "reset")}
                >
                  Back to “to check”
                </button>
              )}
            </div>
          </header>
          {err && (
            <p className="adm-note err" role="alert">
              {err}
            </p>
          )}

          <div className="adm-cols wide-left">
            <section className="adm-panel">
              <h2>ID card photo</h2>
              <Document id={v.id} name={v.file_name} />
              <small className="block">
                {v.file_name} · {Math.max(1, Math.round(v.file_size / 1024))} KB
              </small>
            </section>
            <div>
              <section className="adm-panel">
                <h2>Employee</h2>
                <dl className="adm-fields one">
                  <Field label="Department">{v.department}</Field>
                  <Field label="Reviewed">
                    {v.reviewed_at ? when(v.reviewed_at) : "Not yet"}
                  </Field>
                </dl>
              </section>
              <section className="adm-panel">
                <h2>Booking</h2>
                {v.order ? (
                  <dl className="adm-fields one">
                    <Field label="Order">
                      <Link to={`/admin/orders/${v.order.id}`}>
                        #{v.order.order_no}
                      </Link>{" "}
                      <Status value={v.order.status} />
                    </Field>
                    <Field label="Preferred">
                      {v.order.preferred_date} {v.order.preferred_time}
                    </Field>
                    <Field label="Price">
                      {money(v.order.subtotal)} − {money(v.order.discount)} ={" "}
                      <b>{money(v.order.total)}</b>
                    </Field>
                    <Field label="Payment receipt">
                      {v.order.request_submitted_at
                        ? `sent ${when(v.order.request_submitted_at)}`
                        : "Not sent yet"}
                    </Field>
                    {v.order.customer_id && (
                      <Field label="Customer">
                        <Link to={`/admin/customers/${v.order.customer_id}`}>
                          Full profile
                        </Link>
                      </Field>
                    )}
                  </dl>
                ) : (
                  <p className="adm-muted">
                    Not booked yet. The upload can be used for a booking until{" "}
                    {when(
                      new Date(new Date(v.created_at).getTime() + 7 * 864e5),
                    )}
                    .
                  </p>
                )}
              </section>
              <section className="adm-panel">
                <h2>Note</h2>
                <textarea
                  className="adm-textarea"
                  rows="3"
                  maxLength={500}
                  value={note ?? v.admin_note ?? ""}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Only admins see this"
                  aria-label="Admin note"
                />
                <div className="adm-row">
                  <button
                    className="adm-btn"
                    disabled={note === null || busy === "note"}
                    onClick={() => update({ admin_note: note }, "note")}
                  >
                    {busy === "note" ? "Saving…" : "Save note"}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </Loader>
  );
}
