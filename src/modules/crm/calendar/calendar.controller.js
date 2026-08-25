'use strict';

const calendarService = require('./calendar.service');
const { pool } = require('../../../config/database');

async function getAuthUrl(req, res) {
  try {
    const userId = req.user.id; // from requireAuth middleware
    const tenantId = req.user.tenant_id; // Usually available, or we can use db name
    
    // Create state variable to track who is logging in
    const state = Buffer.from(JSON.stringify({ userId, tenantId })).toString('base64');
    
    const url = calendarService.generateAuthUrl(state);
    res.json({ status: 'ok', data: { url } });
  } catch (err) {
    console.error('[Calendar] getAuthUrl Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function oauthCallback(req, res) {
  try {
    const { code, state } = req.query;
    if (!code) {
      return res.status(400).send('No code provided');
    }

    let parsedState;
    try {
      parsedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    } catch (e) {
      return res.status(400).send('Invalid state');
    }

    const { userId, tenantId } = parsedState;

    // Exchange code for tokens
    const tokens = await calendarService.getTokensFromCode(code);

    // Save tokens to database (Using the tenant pool)
    // NOTE: This assumes the callback hits the main API and we have a way to access the tenant pool
    // In a multi-tenant app, you might need to route this properly or pass the db name in state
    // For now, assuming `pool` points to the active tenant if it's single process, or we need getDynamicPool
    
    // Simplification for the demo: We assume the callback has access to the correct DB via config
    // (If using dynamic pools, we need to fetch the pool for tenantId)
    const sql = `
      UPDATE users 
      SET google_access_token = ?, 
          google_refresh_token = COALESCE(?, google_refresh_token), 
          google_token_expiry = ? 
      WHERE id = ?
    `;

    const { tenantStorage } = require('../../../config/database');
    if (tenantId) {
      await new Promise((resolve, reject) => {
        tenantStorage.run(tenantId, async () => {
          try {
            await pool.query(sql, [tokens.access_token, tokens.refresh_token, tokens.expiry_date, userId]);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
    } else {
      await pool.query(sql, [tokens.access_token, tokens.refresh_token, tokens.expiry_date, userId]);
    }

    // Redirect to frontend settings page
    // (Change port if frontend is running elsewhere)
    res.redirect('http://localhost:3000/settings?gcal=success');
  } catch (err) {
    console.error('[Calendar] oauthCallback Error:', err);
    res.redirect('http://localhost:3000/settings?gcal=error');
  }
}

async function getConnectionStatus(req, res) {
  try {
    const [rows] = await pool.query('SELECT google_refresh_token FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.json({ status: 'ok', data: { connected: false } });
    
    const isConnected = rows[0].google_refresh_token ? true : false;
    res.json({ status: 'ok', data: { connected: isConnected } });
  } catch (err) {
    console.error('[Calendar] getConnectionStatus Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

async function disconnect(req, res) {
  try {
    await pool.query('UPDATE users SET google_access_token = NULL, google_refresh_token = NULL, google_token_expiry = NULL WHERE id = ?', [req.user.id]);
    res.json({ status: 'ok', message: 'Google Calendar disconnected' });
  } catch (err) {
    console.error('[Calendar] disconnect Error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = {
  getAuthUrl,
  oauthCallback,
  getConnectionStatus,
  disconnect
};
