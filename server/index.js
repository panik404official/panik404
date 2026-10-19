import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import { makeGiftVoucherPdf } from './giftVoucherPdf.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const adminEmail = process.env.ADMIN_EMAIL || 'panik404official@gmail.com';
const intakeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many requests. Please try again later.' }),
});

app.use(express.json({ limit: '20kb' }));

const text = (value) =>
  typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
    : '';

const validEmail = (value) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function getMailer() {
  const user = process.env.MAIL_USERNAME;
  const pass = process.env.MAIL_PASSWORD;
  if (!user || !pass) {
    const error = new Error('Gmail SMTP is not configured.');
    error.status = 503;
    throw error;
  }

  const smtpPort = Number(process.env.MAIL_PORT || 587);
  const tls = String(process.env.MAIL_TLS || 'true').toLowerCase() === 'true';
  return nodemailer.createTransport({
    host: process.env.MAIL_SERVER || 'smtp.gmail.com',
    port: smtpPort,
    secure: tls && smtpPort === 465,
    requireTLS: tls && smtpPort !== 465,
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: { user, pass: pass.replace(/\s/g, '') },
  });
}

async function sendMail(message) {
  const transporter = getMailer();
  return transporter.sendMail({
    from: `"Panik404" <${process.env.MAIL_FROM || process.env.MAIL_USERNAME}>`,
    ...message,
  });
}

function sendFailure(res, error, kind) {
  if (error.status === 503) {
    return res.status(503).json({ error: 'Email delivery is not configured yet.' });
  }
  console.error(`[mail] ${kind} delivery failed:`, error.message);
  return res.status(502).json({ error: 'We could not send the email. Please try again later.' });
}

app.post('/api/gifts', intakeLimiter, async (req, res) => {
  const who = text(req.body?.who).replace(/[\r\n]+/g, ' ');
  const how = req.body?.how;
  const to = text(req.body?.to);
  const message = text(req.body?.message);
  const sessions = Number(req.body?.sessions);

  if (who.length > 100 || to.length > 500 || message.length > 1000) {
    return res.status(400).json({ error: 'Please shorten the recipient details or personal message.' });
  }
  if (!who || !['email', 'post'].includes(how) || !to || !Number.isInteger(sessions) || sessions < 1 || sessions > 6) {
    return res.status(400).json({ error: 'Please check the recipient, delivery details, and session count.' });
  }
  if (how === 'email' && !validEmail(to)) {
    return res.status(400).json({ error: 'Enter a valid recipient email address.' });
  }
  if (how === 'post' && to.length < 8) {
    return res.status(400).json({ error: 'Enter the recipient’s full mailing address.' });
  }

  const discount = Math.min(50, (sessions - 1) * 10);
  const total = Math.round(8990 * sessions * (1 - discount / 100));
  const savings = 9950 * sessions - total;
  const price = `Rs ${total.toLocaleString('en-US')}`;
  const notification = [
    'A gift session request was submitted.',
    '',
    `Recipient: ${who}`,
    `Delivery: ${how === 'email' ? 'Email' : 'Post'}`,
    `${how === 'email' ? 'Recipient email' : 'Mailing address'}: ${to}`,
    `Sessions: ${sessions}`,
    `Total shown: ${price}`,
    `Discount: ${discount}%`,
    `Savings shown: Rs ${savings.toLocaleString('en-US')}`,
    `Personal message: ${message || '(none)'}`,
    '',
    'This is a request notification, not confirmation of payment.',
  ].join('\n');

  try {
    const voucher = how === 'email' ? await makeGiftVoucherPdf({ who, message, how, sessions, total }) : null;
    const attachment = voucher
      ? [
          {
            filename: 'panik-session-gift-request.pdf',
            content: voucher,
            contentType: 'application/pdf',
          },
        ]
      : undefined;
    const mailTasks = [
      sendMail({
        to: adminEmail,
        subject: `New gift session request for ${who}`,
        text: notification,
        attachments: attachment,
      }),
    ];

    if (how === 'email') {
      mailTasks.push(
        sendMail({
          to,
          subject: 'A Panik session gift request is ready',
          text: [
            `Hello ${who},`,
            '',
            'Someone has prepared a Panik session gift request for you. The attached PDF is a copy of the request.',
            `Sessions: ${sessions}`,
            `Message: ${message || '(no personal message)'}`,
            '',
            'The PDF is not redeemable and is not a payment receipt. Panik will confirm the gift after payment is verified.',
          ].join('\n'),
          attachments: attachment,
        }),
      );
    }

    await Promise.all(mailTasks);
    return res.json({ message: 'Gift request emails sent.' });
  } catch (error) {
    return sendFailure(res, error, 'gift');
  }
});

app.post('/api/bookings', intakeLimiter, async (req, res) => {
  const form = req.body?.form;
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return res.status(400).json({ error: 'Booking details are missing.' });
  }

  const fields = {
    name: text(form.name).replace(/[\r\n]+/g, ' '),
    email: text(form.email),
    phone: text(form.phone),
    age: text(form.age),
    role: text(form.role),
    concern: Array.isArray(form.concern) ? form.concern.map(text) : [],
    description: text(form.desc),
    distress: text(String(form.distress ?? '')),
    duration: text(form.duration),
    danger: text(form.danger),
    suicidal: text(form.suicidal),
    selfHarm: text(form.harm),
    medicalEmergency: text(form.medical),
    currentTreatment: text(form.treatment),
    preferredDate: text(form.date),
    preferredTime: `${text(form.hh)}:${text(form.mm)} ${text(form.ampm)}`,
    notes: text(form.notes),
    coupon: text(form.coupon),
    paymentReceiptFileName: text(form.file),
  };
  const maxLengths = {
    name: 100,
    email: 254,
    phone: 50,
    age: 3,
    role: 80,
    concern: 80,
    description: 3000,
    distress: 2,
    duration: 80,
    danger: 30,
    suicidal: 30,
    selfHarm: 30,
    medicalEmergency: 30,
    currentTreatment: 3000,
    preferredDate: 20,
    preferredTime: 8,
    notes: 3000,
    coupon: 100,
    paymentReceiptFileName: 255,
  };
  const hasLongField = Object.entries(fields).some(([key, value]) =>
    Array.isArray(value)
      ? value.length > 20 || value.some((answer) => !answer || answer.length > maxLengths.concern)
      : value.length > maxLengths[key],
  );

  if (
    hasLongField ||
    !fields.name ||
    !validEmail(fields.email) ||
    !fields.phone ||
    !/^\d{1,3}$/.test(fields.age) ||
    !fields.role ||
    !fields.concern.length ||
    !fields.duration ||
    !/^(?:[0-9]|10)$/.test(fields.distress) ||
    !fields.danger ||
    !fields.suicidal ||
    !fields.selfHarm ||
    !fields.medicalEmergency ||
    !fields.currentTreatment ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fields.preferredDate) ||
    !/^(?:[1-9]|1[0-2])$/.test(text(form.hh)) ||
    !/^(?:[0-9]|[1-5][0-9])$/.test(text(form.mm)) ||
    !['AM', 'PM'].includes(text(form.ampm)) ||
    !fields.notes ||
    form.consent !== true
  ) {
    return res.status(400).json({ error: 'Please complete all required booking details and consent.' });
  }

  const adminText = [
    'A new booking request was submitted.',
    '',
    ...Object.entries(fields).map(([key, value]) => {
      const label = key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
      return `${label}: ${Array.isArray(value) ? value.join(', ') || '(none)' : value || '(none)'}`;
    }),
    'Session mode: Online via Google Meet',
    'Payment status: Not verified',
    'Consent: Yes',
  ].join('\n');

  try {
    await Promise.all([
      sendMail({
        to: adminEmail,
        replyTo: fields.email,
        subject: `New booking request from ${fields.name}`,
        text: adminText,
      }),
      sendMail({
        to: fields.email,
        subject: 'We received your Panik session request',
        text: [
          `Hello ${fields.name},`,
          '',
          'We received your session request. Our team will review your preferred appointment time and contact you about next steps.',
          '',
          'Your appointment is not confirmed yet. It will be scheduled after your payment is verified.',
          '',
          'If you are in immediate danger or experiencing a medical emergency, contact local emergency services now. Do not wait for an email reply.',
        ].join('\n'),
      }),
    ]);
    return res.json({ message: 'Booking confirmation emails sent.' });
  } catch (error) {
    return sendFailure(res, error, 'booking');
  }
});

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status >= 500) console.error('[api] request processing failed:', error.message);
  return res.status(status).json({
    error:
      status === 413
        ? 'Request is too large.'
        : status === 400
          ? 'Invalid request body.'
          : 'The request could not be processed.',
  });
});

app.listen(port, () => {
  console.log(`Panik mail API listening on port ${port}`);
});
