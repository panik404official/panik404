import OrderList from '../OrderList';

/** The shop: journal orders and gift vouchers. Session bookings live under Sessions. */
export default function Orders() {
  return (
    <>
      <header className="adm-head">
        <h1>Orders</h1>
      </header>
      <p className="adm-lede">
        Journals bought from the shop, and gift vouchers for sessions. Session bookings are under Sessions.
      </p>
      <OrderList group="shop" kinds={['product', 'gift']} />
    </>
  );
}
