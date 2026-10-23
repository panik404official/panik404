import { Link, useParams } from 'react-router-dom';
import { useAdmin } from '../ctx';
import { OrderCard, Timeline, VisitorRow } from '../parts';
import { Field, Loader, when } from '../ui';

export default function OrderDetail() {
  const { id } = useParams();
  const { data: o, error, loading, reload } = useAdmin(`/orders/${id}`);
  return (
    <Loader error={error} loading={loading} onRetry={reload}>
      {o && (
        <>
          <p className="adm-crumb">
            {o.kind === 'booking' ? <Link to="/admin/sessions?tab=bookings">Sessions</Link> : <Link to="/admin/orders">Orders</Link>}
          </p>
          <header className="adm-head"><h1>Order #{o.order_no}</h1></header>
          <div className="adm-cols wide-left">
            <OrderCard order={o} onChanged={reload} linkTitle={false} />
            <section className="adm-panel">
              <h2>Customer</h2>
              <dl className="adm-fields one">
                <Field label="Name"><Link to={`/admin/customers/${o.customer.id}`}>{o.customer.name || '—'}</Link></Field>
                <Field label="Email"><a href={`mailto:${o.customer.email}`}>{o.customer.email}</a></Field>
                <Field label="Phone">{o.customer.phone ? <a href={`tel:${o.customer.phone}`}>{o.customer.phone}</a> : '—'}</Field>
                <Field label="Customer since">{when(o.customer.created_at)}</Field>
                <Field label="Idempotency key"><code>{o.idempotency_key || '—'}</code></Field>
              </dl>
              <Link className="adm-btn" to={`/admin/customers/${o.customer.id}`}>Open full customer profile</Link>
            </section>
          </div>
          {o.visitor && (
            <section className="adm-panel">
              <h2>Browser that placed the order</h2>
              <VisitorRow v={o.visitor} />
            </section>
          )}
          <h2 className="adm-h2">What they did before ordering</h2>
          <Timeline events={o.session_events} sessions={o.session ? [o.session] : []} newestFirst={false} />
        </>
      )}
    </Loader>
  );
}
