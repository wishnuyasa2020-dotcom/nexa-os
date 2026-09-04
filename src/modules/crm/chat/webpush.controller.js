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

    const [existing] = await pool.query('SELECT id FROM push_subscriptions WHERE endpoint = ? LIMIT 1', [endpoint]);
    if (existing.length > 0) {
      await pool.query(
        'UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [userId, keys.p256dh, keys.auth, existing[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
        [userId, endpoint, keys.p256dh, keys.auth]
      );
    }

    res.json({ status: 'ok', message: 'Subscription saved' });
  } catch (err) {
    console.error('[WebPush] subscribe error:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { subscribe };
