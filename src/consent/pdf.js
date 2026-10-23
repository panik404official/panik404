import { ACK, CONFIRM, INTRO, SITE, TERMS } from './content';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}` : iso;
}
export function fmtDT(v) {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return v;
  let h = +m[4];
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}, ${String(h).padStart(2, '0')}:${m[5]} ${ap}`;
}
export function fmtStamp(value) {
  const d = new Date(value);
  const p = (n) => String(n).padStart(2, '0');
  return `${fmtDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const slug = (s) =>
  String(s || 'client')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'client';

/** Builds the signed consent PDF as a Blob. jsPDF is loaded on demand so other pages never download it. */
export async function buildPdf(f, { reference, completedAt }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(),
    H = doc.internal.pageSize.getHeight(),
    M = 52,
    CW = W - 2 * M;
  let y = M;
  // The built-in Helvetica only covers Latin-1, so typographic punctuation is mapped to plain characters.
  const san = (s) =>
    String(s == null ? '' : s)
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/•/g, '-')
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
  const ensure = (h) => {
    if (y + h > H - M - 14) {
      doc.addPage();
      y = M;
    }
  };
  function text(t, o = {}) {
    const size = o.size || 10,
      ind = o.indent || 0;
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(o.color || [27, 18, 51]));
    const lines = doc.splitTextToSize(san(t), CW - ind),
      lh = size * 1.42;
    lines.forEach((l) => {
      ensure(lh);
      doc.text(l, M + ind, y + size);
      y += lh;
    });
    y += o.gap == null ? 6 : o.gap;
  }
  function heading(n, t) {
    ensure(46);
    y += 8;
    doc.setDrawColor(198, 180, 236);
    doc.line(M, y, W - M, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(108, 79, 176);
    doc.text(String(n).padStart(2, '0'), M, y + 12);
    doc.setTextColor(27, 18, 51);
    doc.text(san(t), M + 28, y + 12);
    y += 24;
  }
  function body(blocks) {
    blocks.forEach((blk) => {
      if (typeof blk === 'string') return text(blk, { gap: 6 });
      blk.ul.forEach((it) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(27, 18, 51);
        doc.splitTextToSize(san(it), CW - 22).forEach((l, i) => {
          ensure(14.2);
          if (i === 0) doc.text('-', M + 8, y + 10);
          doc.text(l, M + 22, y + 10);
          y += 14.2;
        });
        y += 3;
      });
    });
  }
  function kv(k, v) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(san(v || '-'), CW - 150);
    ensure(Math.max(1, lines.length) * 14 + 2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(107, 99, 130);
    doc.text(san(k), M, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(27, 18, 51);
    lines.forEach((l) => {
      doc.text(l, M + 150, y + 10);
      y += 14;
    });
    y += 2;
  }
  function sig(label, img, name, date) {
    ensure(100);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(107, 99, 130);
    doc.text(san(label).toUpperCase(), M, y + 9);
    y += 14;
    doc.setDrawColor(198, 180, 236);
    doc.rect(M, y, 190, 64);
    if (img) doc.addImage(img, 'PNG', M + 2, y + 2, 186, 60);
    y += 76;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(27, 18, 51);
    doc.text(san(name + (date ? '   |   ' + fmtDate(date) : '')), M, y);
    y += 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(108, 79, 176);
  doc.text('PANIK', M, y + 18);
  y += 26;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 99, 130);
  doc.text('PSYCHOLOGICAL SERVICES & CORPORATE WELLNESS', M, y + 6);
  y += 24;
  text('Informed Consent for Psychological Services', { size: 16, bold: true, gap: 2 });
  text('Confidential client document', { size: 9, color: [107, 99, 130], gap: 8 });
  text(INTRO, { gap: 4 });

  let n = 1;
  heading(n++, 'Client information');
  kv('Full name', f.name);
  kv('Date of birth', fmtDate(f.dob));
  kv('Phone number', f.phone);
  kv('Email address', f.email);
  kv('Emergency contact', f.ename);
  kv('Emergency number', f.ephone);
  kv('Date', fmtDate(f.date));
  kv('Session', fmtDT(f.session_time));
  kv('Presenting complaint', f.complaint);
  TERMS.forEach((t) => {
    heading(n++, t.title);
    body(t.blocks);
  });
  heading(n++, ACK.title);
  body(ACK.blocks);
  kv('Client full name', f.name);
  kv('Session time', fmtDT(f.session_time));
  y += 4;
  sig('Client signature', f.sig_client, f.name || '', f.date);
  heading(n++, 'Psychologist details and declaration');
  kv('Full name', f.pname);
  kv('Qualification', f.pqual);
  y += 4;
  sig('Psychologist signature', f.sig_psych, f.pname || '', f.date);
  heading(n++, 'Parent or legal guardian');
  if (f.gneed) {
    kv('Name', f.gname);
    kv('Relationship to client', f.grel);
    y += 4;
    sig('Parent / guardian signature', f.sig_guardian, f.gname || '', f.date);
  } else text('Not applicable.', { color: [107, 99, 130] });
  heading(n++, 'Referral or gift information');
  if (f.gift) {
    kv('Gifted or purchased by someone else', 'Yes');
    kv('Name', f.rname);
    kv('Relationship to client', f.rrel);
    kv('Contact', f.rcontact);
    kv('Gift / referral code', f.rcode);
  } else kv('Gifted or purchased by someone else', 'No');
  heading(n++, CONFIRM.title);
  body(CONFIRM.blocks);
  text(`Signed electronically on ${fmtStamp(completedAt || Date.now())}. Reference ${reference || '-'}.`, {
    size: 8.5,
    color: [107, 99, 130],
    gap: 0,
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 130, 165);
    doc.text(`Panik - Psychological Services & Corporate Wellness  |  ${SITE}`, M, H - 26);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 26, { align: 'right' });
  }
  return doc.output('blob');
}

export function saveBlob(blob, filename) {
  const u = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: u, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
