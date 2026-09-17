'use strict';

/**
 * NexaMOS Shared Gmail REST API Mailer
 * Menggantikan nodemailer SMTP yang diblokir oleh Render Free Tier.
 * Menggunakan Google Gmail API v1 via HTTPS OAuth2 dengan MIME RFC 2047 encoding.
 */

const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');

/**
 * Helper untuk menyusun pesan RFC 2822 / 5322 MIME yang valid,
 * mendukung subjek UTF-8, emoji, dan karakter non-ASCII (RFC 2047).
 */
function buildMimeMessage({ from, to, subject, html, text }) {
  return new Promise((resolve, reject) => {
    const mail = new MailComposer({
      from,
      to,
      subject,
      html,
      text,
    });

    mail.compile().build((err, message) => {
      if (err) return reject(err);
      resolve(message);
    });
  });
}

/**
 * Kirim email via Gmail REST API (OAuth2).
 * @param {object} opts
 * @param {string} opts.to        - Penerima email
 * @param {string} opts.subject   - Subjek email (mendukung emoji & karakter non-ASCII)
 * @param {string} opts.html      - Konten HTML
 * @param {string} [opts.text]    - Konten teks plain alternatif (opsional)
 * @param {string} [opts.from]    - Display name pengirim (contoh: '"NexaMOS Support"')
 */
async function sendGmailAPI({ to, subject, html, text, from }) {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const senderEmail  = process.env.GMAIL_SENDER || process.env.SMTP_USER;

  if (!clientId || !clientSecret || !refreshToken || !senderEmail) {
    console.warn('[Mailer] Gmail API credentials tidak lengkap — email dilewati.');
    return;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Format pengirim (From)
  let formattedFrom = `"NexaMOS" <${senderEmail}>`;
  if (from) {
    formattedFrom = from.includes('<') ? from : `${from} <${senderEmail}>`;
  }

  let rawBuffer;
  try {
    rawBuffer = await buildMimeMessage({
      from: formattedFrom,
      to,
      subject,
      html,
      text,
    });
  } catch (composeErr) {
    console.warn('[Mailer] MailComposer gagal, menggunakan fallback RFC 2047:', composeErr.message);
    // Fallback: encode Subject via RFC 2047 Base64
    const safeSubject = /^[\x20-\x7E]*$/.test(subject || '')
      ? (subject || '')
      : `=?UTF-8?B?${Buffer.from(subject || '', 'utf-8').toString('base64')}?=`;

    const rawMessage = [
      `From: ${formattedFrom}`,
      `To: ${to}`,
      `Subject: ${safeSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      html || '',
    ].join('\r\n');

    rawBuffer = Buffer.from(rawMessage, 'utf-8');
  }

  const encodedMessage = rawBuffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });

  return response.data;
}

module.exports = { sendGmailAPI };

