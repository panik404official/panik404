import PDFDocument from 'pdfkit';

function pdfSafe(value) {
  return value.normalize('NFKD').replace(/[^\x20-\x7e]/g, '');
}

export function makeGiftVoucherPdf({ who, message, how, sessions, total }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [576, 363], margin: 24 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width;
    const height = doc.page.height;
    doc.rect(0, 0, width, height).fill('#261e39');
    doc.roundedRect(16, 16, width - 32, height - 32, 18).fill('#302449');

    doc.fillColor('#c4b5fd').font('Helvetica-Bold').fontSize(9);
    doc.text('PANIK404  /  SESSION GIFT', 34, 34, { characterSpacing: 1 });
    doc.fillColor('#f3edff').font('Helvetica-Bold').fontSize(21);
    doc.text('A little room to breathe', 34, 62, { width: 330, lineBreak: false });
    doc.fillColor('#bda4ff').font('Helvetica').fontSize(8);
    doc.text(`TO  /  ${sessions} SESSION${sessions === 1 ? '' : 'S'}`, 34, 112, {
      characterSpacing: 0.8,
    });
    doc.fillColor('#c4b5fd').font('Helvetica-Bold').fontSize(23);
    doc.text(pdfSafe(who), 34, 129, { width: 300, height: 31, ellipsis: true });

    const messageTop = 176;
    doc
      .moveTo(34, messageTop)
      .lineTo(34, messageTop + 48)
      .lineWidth(2)
      .stroke('#bda4ff');
    doc.fillColor('#f3edff').font('Helvetica').fontSize(10);
    doc.text(pdfSafe(message || 'A thoughtful gift for you.'), 44, messageTop, {
      width: 275,
      height: 48,
      ellipsis: true,
    });

    doc.roundedRect(356, 104, 180, 134, 14).fill('#493664');
    doc.fillColor('#d8c7ff').font('Helvetica-Bold').fontSize(8);
    doc.text(`DELIVERY  /  ${how.toUpperCase()}`, 374, 122, { characterSpacing: 0.8 });
    doc.fillColor('#bda4ff').font('Helvetica').fontSize(8);
    doc.text('TOTAL', 374, 158, { characterSpacing: 0.8 });
    doc.fillColor('#f3edff').font('Helvetica-Bold').fontSize(20);
    doc.text(`Rs ${total.toLocaleString('en-US')}`, 374, 176, { width: 144, lineBreak: false });

    doc
      .moveTo(34, height - 72)
      .lineTo(width - 34, height - 72)
      .lineWidth(0.7)
      .stroke('#55456f');
    doc.fillColor('#d8c7ff').font('Helvetica-Bold').fontSize(7);
    doc.text('GIFT REQUEST - PAYMENT PENDING', 34, height - 61, { characterSpacing: 0.5 });
    doc.fillColor('#bda4ff').font('Helvetica').fontSize(7);
    doc.text(
      'This request copy is not redeemable. Panik will confirm the gift after payment is verified.',
      34,
      height - 47,
      { width: width - 68, lineBreak: false },
    );
    doc.end();
  });
}
