import { Link } from 'react-router-dom';
import { useAdmin } from '../ctx';
import { Empty, Loader, Status, money, when } from '../ui';

export default function Catalogue() {
  const p = useAdmin('/products');
  const pay = useAdmin('/payments', { limit: 200 });
  return (
    <>
      <header className="adm-head"><h1>Products & payments</h1></header>
      <h2 className="adm-h2">Products</h2>
      <Loader error={p.error} loading={p.loading} onRetry={p.reload}>
        {p.data && (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead><tr><th>Product</th><th>ID</th><th>Type</th><th>Price</th><th>Active</th><th>Units sold</th><th>Revenue</th></tr></thead>
              <tbody>
                {p.data.items.map((x) => (
                  <tr key={x.id}><td>{x.name}</td><td><code>{x.id}</code></td><td>{x.kind}</td><td>{money(x.unit_price)}</td><td>{x.active ? 'Yes' : 'No'}</td><td>{x.units_sold}</td><td>{money(x.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loader>
      <h2 className="adm-h2">Payment log</h2>
      <Loader error={pay.error} loading={pay.loading} onRetry={pay.reload}>
        {pay.data && (pay.data.items.length ? (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead><tr><th>When</th><th>Order</th><th>Customer</th><th>Status</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
              <tbody>
                {pay.data.items.map((x) => (
                  <tr key={x.id}>
                    <td>{when(x.created_at)}</td><td><Link to={`/admin/orders/${x.order_id}`}>#{x.order_no}</Link></td>
                    <td><Link to={`/admin/customers/${x.customer_id}`}>{x.email}</Link></td><td><Status value={x.status} /></td>
                    <td>{money(x.amount)}</td><td>{x.provider}</td><td><code>{x.provider_ref || '—'}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No payments recorded yet. Marking an order paid adds one here.</Empty>)}
      </Loader>
    </>
  );
}
