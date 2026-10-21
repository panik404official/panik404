import { useState } from 'react';
import { DEFAULT_PSYCH } from '../consent/content';

export const STATE_LABEL = { open: 'Open', completed: 'Signed', expired: 'Expired', revoked: 'Closed' };
export { DEFAULT_PSYCH };

/** Public link for a form token. Uses this site's address, so it works on localhost and in production. */
export const consentLink = (token) => `${location.origin}${location.pathname}#/consent/${token}`;

export function emailLinkHref(form) {
  const name = form.client_name || form.data?.name || '';
  const body = [
    `Hello${name ? ` ${name.split(' ')[0]}` : ''},`,
    '',
    'Before your session, please read and sign your informed consent form here:',
    consentLink(form.token),
    '',
    'Your answers save as you type, so you can come back to the same link to finish.',
    form.expires_at ? `The link works until ${new Date(form.expires_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` : '',
    '',
    'Panik',
  ].join('\n');
  return `mailto:${encodeURIComponent(form.client_email || form.data?.email || '')}?subject=${encodeURIComponent(
    'Your Panik consent form',
  )}&body=${encodeURIComponent(body)}`;
}

export function ConsentState({ form }) {
  return <span className={`adm-status c-${form.state}`}>{STATE_LABEL[form.state] || form.state}</span>;
}

export function CopyButton({ text, label = 'Copy link', className = 'adm-btn' }) {
  const [done, setDone] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone('Copied');
    } catch {
      setDone('Select and copy');
    }
    setTimeout(() => setDone(''), 1600);
  };
  return (
    <button type="button" className={className} onClick={copy}>
      {done || label}
    </button>
  );
}
