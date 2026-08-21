'use strict';

/**
 * crm.webhook.routes.js
 * Routes untuk WhatsApp Webhook (Meta API)
 */

const { Router } = require('express');
const { pool } = require('../../config/database');

const router = Router();

// GET /api/webhook/whatsapp — Verifikasi Webhook dari Meta
router.get('/whatsapp', (req, res) => {
  const verify_token = process.env.WA_VERIFY_TOKEN || 'derma_webhook_2026';
  
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
    
  if (mode && token) {
    if (mode === 'subscribe' && token === verify_token) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// POST /api/webhook/whatsapp — Menerima pesan masuk
router.post('/whatsapp', async (req, res) => {
  const body = req.body;

  if (body.object) {
    if (body.entry && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
      const message = body.entry[0].changes[0].value.messages[0];
      const contact = body.entry[0].changes[0].value.contacts[0];
      
      const bsuid = message.from; // ID spesifik WhatsApp Business
      const no_wa = contact ? contact.wa_id : bsuid;

      try {
        const [rows] = await pool.query("SELECT id FROM master_siswa WHERE bsuid = ?", [bsuid]);
        if (rows.length === 0) {
          // Binding BSUID ke No WA jika ada
          const waClean = String(no_wa).replace(/[^0-9]/g, '');
          const [waRows] = await pool.query("SELECT id FROM master_siswa WHERE no_wa = ?", [waClean]);
          if (waRows.length > 0) {
            await pool.query("UPDATE master_siswa SET bsuid = ? WHERE no_wa = ?", [bsuid, waClean]);
            console.log(`[Webhook] BSUID ${bsuid} terikat (bind) ke No WA ${waClean}.`);
          } else {
            // Jika lead organik murni (tanpa WA di master), ini handle terpisah di modul chat (bisa insert baru)
            console.log(`[Webhook] Unidentified lead dari BSUID ${bsuid}.`);
          }
        }
      } catch (e) {
        console.error('[Webhook] Error DB binding:', e);
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

module.exports = router;
