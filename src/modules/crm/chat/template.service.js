'use strict';

/**
 * template.service.js
 * Service layer untuk manajemen wa_templates
 */

const { pool } = require('../../../config/database');

const axios    = require('axios');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/templates — List semua template
// ─────────────────────────────────────────────────────────────────────────────
async function getTemplates(query = {}) {
  const status   = query.status   || '';   // 'APPROVED' | 'PENDING' | 'REJECTED' | 'LOCAL_ONLY'
  const pipeline = query.pipeline || '';
  const search   = query.search   || '';

  const whereParts = [];
  const params     = [];

  if (status) {
    whereParts.push('meta_status = ?');
    params.push(status);
  }
  if (pipeline) {
    whereParts.push('pipeline = ?');
    params.push(pipeline);
  }
  if (search) {
    whereParts.push('(nama_template LIKE ? OR body_text LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT * FROM wa_templates ${where} ORDER BY urutan ASC, created_date DESC`,
    params
  );

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/templates — Buat template baru
// ─────────────────────────────────────────────────────────────────────────────
async function createTemplate(data) {
  const {
    pipeline, nama_template, template_name_api, language_code = 'id',
    body_text, kategori, urutan = 99, parameters = '[]',
    submitToMeta = false,
  } = data;

  if (!nama_template || !body_text) {
    throw new Error('nama_template dan body_text wajib diisi.');
  }

  let metaStatus   = 'LOCAL_ONLY';
  let metaTemplId  = null;

  if (submitToMeta) {
    // Submit ke Meta dan tunggu hasilnya
    const result = await submitTemplateToMeta({ nama_template, template_name_api, body_text, language_code, kategori });
    metaStatus  = 'PENDING';
    metaTemplId = result?.id || null;
  }

  const [inserted] = await pool.query(
    `INSERT INTO wa_templates
       (pipeline, nama_template, template_name_api, language_code,
        body_text, kategori, urutan, status_crm, meta_status,
        meta_template_id, parameters, created_date, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, NOW(), NOW())`,
    [
      pipeline || null,
      nama_template,
      template_name_api || nama_template.toLowerCase().replace(/\s+/g, '_'),
      language_code,
      body_text,
      kategori || 'UTILITY',
      urutan,
      metaStatus,
      metaTemplId,
      typeof parameters === 'string' ? parameters : JSON.stringify(parameters),
    ]
  );

  return { id_template: inserted.insertId, meta_status: metaStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/templates/:id — Update template
// ─────────────────────────────────────────────────────────────────────────────
async function updateTemplate(id, data) {
  const { nama_template, body_text, kategori, urutan, status_crm, parameters } = data;

  const setClauses = [];
  const params     = [];

  if (nama_template !== undefined) { setClauses.push('nama_template = ?'); params.push(nama_template); }
  if (body_text     !== undefined) { setClauses.push('body_text = ?');     params.push(body_text); }
  if (kategori      !== undefined) { setClauses.push('kategori = ?');      params.push(kategori); }
  if (urutan        !== undefined) { setClauses.push('urutan = ?');        params.push(urutan); }
  if (status_crm    !== undefined) { setClauses.push('status_crm = ?');    params.push(status_crm); }
  if (parameters    !== undefined) {
    setClauses.push('parameters = ?');
    params.push(typeof parameters === 'string' ? parameters : JSON.stringify(parameters));
  }

  if (setClauses.length === 0) throw new Error('Tidak ada field yang diupdate.');

  setClauses.push('last_updated = NOW()');
  params.push(id);

  await pool.query(
    `UPDATE wa_templates SET ${setClauses.join(', ')} WHERE id_template = ?`,
    params
  );

  return { updated: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/templates/sync — Sinkronisasi status dari Meta
// ─────────────────────────────────────────────────────────────────────────────
async function syncMetaStatus() {
  const token = process.env.WA_ACCESS_TOKEN;
  const wabaId = process.env.WA_WABA_ID;

  if (!token || !wabaId) {
    // Dev mode: kembalikan simulasi sync
    console.warn('[Template] WA credentials belum di-set. Sync dilewati (dev mode).');
    return { synced: 0, skipped: 'dev_mode' };
  }

  // Ambil semua template dari Meta
  const url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates?fields=id,name,status,quality_rating&limit=100`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  const metaTemplates = resp.data?.data || [];
  let synced = 0;

  for (const mt of metaTemplates) {
    const [result] = await pool.query(
      `UPDATE wa_templates SET
         meta_status            = ?,
         meta_quality_rating    = ?,
         meta_status_updated_at = NOW(),
         last_updated           = NOW()
       WHERE template_name_api = ? AND meta_status != 'LOCAL_ONLY'`,
      [mt.status, mt.quality_rating || null, mt.name]
    );
    if (result.affectedRows > 0) synced++;
  }

  return { synced, total_from_meta: metaTemplates.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Submit template baru ke Meta
// ─────────────────────────────────────────────────────────────────────────────
async function submitTemplateToMeta({ nama_template, template_name_api, body_text, language_code, kategori }) {
  const token  = process.env.WA_ACCESS_TOKEN;
  const wabaId = process.env.WA_WABA_ID;

  if (!token || !wabaId) {
    console.warn('[Template] Credentials belum di-set. Submit ke Meta dilewati.');
    return { id: null };
  }

  const resp = await axios.post(
    `https://graph.facebook.com/v19.0/${wabaId}/message_templates`,
    {
      name:      template_name_api || nama_template.toLowerCase().replace(/\s+/g, '_'),
      language:  language_code || 'id',
      category:  kategori || 'UTILITY',
      components: [{
        type: 'BODY',
        text: body_text,
      }],
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );

  return resp.data;
}

module.exports = { getTemplates, createTemplate, updateTemplate, syncMetaStatus };
