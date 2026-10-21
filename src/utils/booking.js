// Sessions must be requested at least 48 hours ahead. The server checks the same rule.
export const MIN_NOTICE_HOURS = 48;
export const BOOKING_PRICE = 9995;

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The earliest moment a session can start, in the visitor's local time. */
export const earliest = (now = new Date()) => new Date(now.getTime() + MIN_NOTICE_HOURS * 3600 * 1000);
/** For <input type="date" min>: days before this are disabled in the picker. */
export const minBookingDate = (now) => isoDate(earliest(now));

export const formatWhen = (d) =>
  d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

/** The chosen date and time as a local Date, or null if incomplete or invalid. */
export function preferredMoment(date, hh, mm, ampm) {
  if (!date || hh === undefined || hh === '' || mm === undefined || mm === '') return null;
  const h = Number(hh),
    m = Number(mm);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 1 || h > 12 || m < 0 || m > 59) return null;
  const [y, mo, d] = date.split('-').map(Number);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d, (h % 12) + (ampm === 'PM' ? 12 : 0), m);
}

/** '' when fine, otherwise an error message for the preferred date/time. */
export function checkPreferred(date, hh, mm, ampm, now = new Date()) {
  if (!date) return 'Choose a preferred date.';
  const when = preferredMoment(date, hh, mm, ampm);
  if (!when) return 'Enter a time: hours 1–12 and minutes 0–59.';
  const first = earliest(now);
  if (when < first) return `Sessions need at least 48 hours’ notice. Choose ${formatWhen(first)} or later.`;
  return '';
}
