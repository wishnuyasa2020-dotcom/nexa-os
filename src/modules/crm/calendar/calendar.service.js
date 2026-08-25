'use strict';

const { google } = require('googleapis');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function generateAuthUrl(state) {
  const oauth2Client = getOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/calendar'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Request refresh token
    prompt: 'consent',      // Force consent to always get refresh token
    scope: scopes,
    state: state
  });
}

async function getTokensFromCode(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

const { pool } = require('../../../config/database');

/**
 * Creates an event in Google Calendar.
 * userId: ID user di DB
 * event: { summary, description, startDateTime, endDateTime } // DateTimes in ISO format
 */
async function syncEventToCalendar(userId, eventDetails) {
  const [rows] = await pool.query('SELECT google_access_token, google_refresh_token, google_token_expiry FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) return null;
  const user = rows[0];

  if (!user || !user.google_refresh_token) {
    console.log('[Calendar Sync] User has no connected Google Calendar');
    return null;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
    expiry_date: user.google_token_expiry
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const event = {
    summary: eventDetails.summary,
    description: eventDetails.description,
    reminders: {
      useDefault: true
    }
  };

  if (eventDetails.date) {
    // All-day event
    // Google Calendar API: timeZone should NOT be specified for date (all-day).
    // end.date is exclusive, so for a 1-day event, end date must be the day after start date.
    const startDate = new Date(eventDetails.date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    // Format YYYY-MM-DD
    const endStr = endDate.toISOString().split('T')[0];
    
    event.start = { date: eventDetails.date };
    event.end = { date: endStr };
  } else {
    // Timed event
    event.start = { dateTime: eventDetails.startDateTime, timeZone: 'Asia/Jakarta' };
    event.end = { dateTime: eventDetails.endDateTime, timeZone: 'Asia/Jakarta' };
  }

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    console.log('[Calendar Sync] Event created:', res.data.htmlLink);
    return res.data;
  } catch (error) {
    console.error('[Calendar Sync] Error creating event:', error.message);
    // If the token is invalid or revoked, we might need to handle it gracefully
    throw error;
  }
}

module.exports = {
  generateAuthUrl,
  getTokensFromCode,
  syncEventToCalendar
};
