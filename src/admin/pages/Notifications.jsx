import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAdmin, useMe } from '../ctx';
import { Empty, Loader, ago } from '../ui';

export default function Notifications() {
  const { data, error, loading, reload } = useAdmin('/notifications', { limit: 100 });
  const { refreshBell } = useMe();
  const nav = useNavigate();

  useEffect(() => {
    if (data) refreshBell();
  }, [data, refreshBell]);

  const open = async (n) => {
    if (!n.read_at) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    refreshBell();
    if (n.link) nav(n.link);
    else reload();
  };
  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    refreshBell();
    reload();
  };

  return (
    <>
      <header className="adm-head">
        <h1>Notifications</h1>
        <button className="adm-btn" onClick={readAll} disabled={!data?.unread}>
          Mark all as read
        </button>
      </header>
      <Loader error={error} loading={loading} onRetry={reload}>
        {data &&
          (data.items.length ? (
            <ul className="adm-notes">
              {data.items.map((n) => (
                <li key={n.id} className={n.read_at ? '' : 'unread'}>
                  <button type="button" onClick={() => open(n)}>
                    <span className="adm-notes-title">
                      {!n.read_at && <i className="adm-dot" aria-label="Unread" />}
                      {n.title}
                    </span>
                    {n.body && <span className="adm-notes-body">{n.body}</span>}
                    <small>{ago(n.created_at)}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No notifications yet. You’ll see them here when a client saves a form or one is assigned to you.</Empty>
          ))}
      </Loader>
    </>
  );
}
