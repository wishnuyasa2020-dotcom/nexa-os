'use strict';

/**
 * chat.controller.js
 * HTTP handler untuk Modul Chat Inbox
 */

const chatService = require('./chat.service');

// GET /api/v1/chats — Daftar percakapan
async function getConversationList(req, res) {
  try {
    const data = await chatService.getConversationList(req.user, req.query);
    res.json({ status: 'ok', ...data });
  } catch (err) {
    console.error('[Chat] getConversationList:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// GET /api/v1/chats/:convId/messages — Riwayat pesan
async function getMessages(req, res) {
  try {
    const messages = await chatService.getMessages(req.params.convId, req.query);
    res.json({ status: 'ok', data: messages });
  } catch (err) {
    console.error('[Chat] getMessages:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
}

// POST /api/v1/chats/:convId/send — Kirim pesan (Smart Routing)
async function sendMessage(req, res) {
  try {
    const result = await chatService.sendMessage(req.params.convId, req.body, req.user);
    res.json({ status: 'ok', ...result });
  } catch (err) {
    console.error('[Chat] sendMessage:', err.message);
    // 400 untuk error bisnis (SW closed, template tidak approved, dll)
    const isBizError = err.message.includes('Service Window') ||
                       err.message.includes('Template') ||
                       err.message.includes('tidak ditemukan');
    res.status(isBizError ? 400 : 500).json({ status: 'error', message: err.message });
  }
}

// PATCH /api/v1/chats/:convId/read — Tandai semua pesan sudah dibaca
async function markAsRead(req, res) {
  try {
    const { pool } = require('../../../config/database');

    await pool.query(
      `UPDATE chat_messages SET status = 'read'
       WHERE conv_id = ? AND direction = 'incoming' AND (status IS NULL OR status != 'read')`,
      [req.params.convId]
    );
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
}

module.exports = { getConversationList, getMessages, sendMessage, markAsRead };
