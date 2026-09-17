'use strict';

/**
 * NexaMOS Shared Gmail REST API Mailer
 * Menggantikan nodemailer SMTP yang diblokir oleh Render Free Tier.
 * Menggunakan Google Gmail API v1 via HTTPS OAuth2.
 */

const { google } = require('googleapis');

/**
 * Kirim email via Gmail REST API (OAuth2).
 * @param {object} opts
 * @param {string} opts.to        - Penerima email
 * @param {string} opts.subject   - Subjek email
 * @param {string} opts.html      - Konten HTML
 * @param {string} [opts.from]    - Display name pengirim (tanpa email, diisi otomatis dari GMAIL_SENDER)
 */
async function sendGmailAPI({ to, subject, html, from }) {
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

  const displayFrom = from ? `${from} <${senderEmail}>` : `"NexaMOS" <${senderEmail}>`;

  const rawMessage = [
    `From: ${displayFrom}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    html,
  ].join('\n');

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
}

module.exports = { sendGmailAPI };
