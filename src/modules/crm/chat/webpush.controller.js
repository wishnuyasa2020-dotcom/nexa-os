'use strict';

const { pool } = require('../../../config/database');

// POST /api/v1/web-push/subscribe
async function subscribe(req, res) {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ status: 'error', message: 'Invalid subscription data' });
    }

    const userId = req.user.id;

    // Simpan atau update subscription
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP, p256dh = VALUES(p256dh), auth = VALUES(auth)`,
      [userId, endpoint, keys.p256dh, keys.auth]
    );

    res.json({ status: 'ok', message: 'Subscription saved' });
  } catch (err) {
    console.error('[WebPush] subscribe error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { subscribe };
