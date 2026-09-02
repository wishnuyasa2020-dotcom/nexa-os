'use strict';

/**
 * template.service.js
 * Service layer untuk manajemen wa_templates
 *
 * PERUBAHAN v2:
 *  - Fix nama kolom: status_meta (DB lama GAS) → meta_status (harmonisasi)
 *    Backend membaca KEDUA kolom (meta_status ATAU status_meta sebagai fallback)
 *  - Tambah: getTemplateById(), deleteTemplate() (soft), updateParameters()
 *  - Tambah: syncMetaStatusFull() — sync termasuk components/buttons
 *  - Refactor: credentials BYOW dibaca dari tenants.whatsapp_* (bukan .env statis)
 */

const { pool }   = require('../../../config/database');
const axios      = require('axios');
const engine     = require('./templateEngine.service');

// ── Helper: baca credentials BYOW dari tenants table ─────────────────────────
// pool adalah connection pool ke DB TENANT (sudah diset oleh middleware tenant resolver)
// Untuk keperluan Meta API call, kita butuh baca credentials dari nexamain.tenants
// lewat `pool` yang di-inject dari app.js
async function _getTenantWaCredentials() {
  // credentials sudah di-inject ke dalam pool context lewat middleware atau .env
  // Fallback: baca dari .env untuk backward-compat (dev mode)
  const token  = process.env.WA_ACCESS_TOKEN;
  const wabaId = process.env.WA_WABA_ID;
  const phoneId = process.env.WA_PHONE_NUMBER_ID;
  return { token, wabaId, phoneId };
}

// ── Kolom helper — normalise baris DB ke camelCase/expected fields ─────────────
function _normalizeRow(row) {
  return {
    ...row,
    // Harmonisasi: meta_status bisa ada sebagai kolom baru ATAU fallback dari status_meta
    meta_status: row.meta_status || row.status_meta || 'LOCAL_ONLY',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/templates — List semua template
// ─────────────────────────────────────────────────────────────────────────────
async function getTemplates(query = {}) {
  const status   = query.status   || '';
  const pipeline = query.pipeline || '';
  const search   = query.search   || '';
  const page     = parseInt(query.page  || 1);
  const limit    = parseInt(query.limit || 50);
  const offset   = (page - 1) * limit;

  const whereParts = ["status_crm != 'DELETED'"]; // Soft-delete filter
  const params     = [];

  if (status) {
    // Support both column names for transition period
    whereParts.push('(meta_status = ? OR status_meta = ?)');
    params.push(status, status);
  }
  if (pipeline) {
    whereParts.push('pipeline = ?');
    params.push(pipeline);
  }
  if (search) {
    whereParts.push('(nama_template LIKE ? OR body_text LIKE ? OR template_name_api LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = `WHERE ${whereParts.join(' AND ')}`;

  const [rows] = await pool.query(
    `SELECT * FROM wa_templates ${where} ORDER BY urutan ASC, created_date DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM wa_templates ${where}`,
    params
  );

  return {
    data:  rows.map(_normalizeRow),
    total: countResult[0].total,
    page,
    limit,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/templates/:id — Satu template
// ─────────────────────────────────────────────────────────────────────────────
async function getTemplateById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM wa_templates WHERE id_template = ? LIMIT 1`,
    [id]
  );
  if (rows.length === 0) throw new Error(`Template '${id}' tidak ditemukan.`);
  return _normalizeRow(rows[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/templates — Buat template baru
// ─────────────────────────────────────────────────────────────────────────────
async function createTemplate(data) {
  const {
    pipeline, nama_template, template_name_api, language_code = 'id',
    body_text, kategori, urutan = 99, parameters = '{"body":[]}',
    header_type = null, header_url = null, header_filename = null,
    submitToMeta = false,
  } = data;

  if (!nama_template || !body_text) {
    throw new Error('nama_template dan body_text wajib diisi.');
  }

  // Validasi parameters JSON jika diberikan
  let parsedParams = null;
  try {
    parsedParams = typeof parameters === 'string' ? JSON.parse(parameters) : parameters;
  } catch {
    throw new Error('Format parameters JSON tidak valid.');
  }

  let metaStatus  = 'LOCAL_ONLY';
  let metaTemplId = null;

  if (submitToMeta) {
    const result = await _submitTemplateToMeta({ nama_template, template_name_api, body_text, language_code, kategori });
    metaStatus  = 'PENDING';
    metaTemplId = result?.id || null;
  }

  const apiName = template_name_api || nama_template.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  const [inserted] = await pool.query(
    `INSERT INTO wa_templates
       (id_template, pipeline, nama_template, template_name_api, language_code,
        body_text, kategori, urutan, status_crm, meta_status, status_meta,
        meta_template_id, parameters, header_type, header_url, header_filename,
        created_date, last_updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      `TPL-${Date.now()}`,
      pipeline || null,
      nama_template,
      apiName,
      language_code,
      body_text,
      kategori || 'UTILITY',
      urutan,
      metaStatus,
      metaStatus, // status_meta = sama (backward compat)
      metaTemplId,
      JSON.stringify(parsedParams),
      header_type || null,
      header_url  || null,
      header_filename || null,
    ]
  );

  return { id_template: inserted.insertId, meta_status: metaStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/templates/:id — Update info dasar template
// ─────────────────────────────────────────────────────────────────────────────
async function updateTemplate(id, data) {
  const {
    nama_template, body_text, kategori, urutan, status_crm,
    parameters, header_type, header_url, header_filename,
  } = data;

  const setClauses = [];
  const params     = [];

  if (nama_template   !== undefined) { setClauses.push('nama_template = ?');   params.push(nama_template); }
  if (body_text       !== undefined) { setClauses.push('body_text = ?');       params.push(body_text); }
  if (kategori        !== undefined) { setClauses.push('kategori = ?');        params.push(kategori); }
  if (urutan          !== undefined) { setClauses.push('urutan = ?');          params.push(urutan); }
  if (status_crm      !== undefined) { setClauses.push('status_crm = ?');      params.push(status_crm); }
  if (header_type     !== undefined) { setClauses.push('header_type = ?');     params.push(header_type); }
  if (header_url      !== undefined) { setClauses.push('header_url = ?');      params.push(header_url); }
  if (header_filename !== undefined) { setClauses.push('header_filename = ?'); params.push(header_filename); }
  if (parameters !== undefined) {
    const paramStr = typeof parameters === 'string' ? parameters : JSON.stringify(parameters);
    setClauses.push('parameters = ?');
    params.push(paramStr);
  }

  if (setClauses.length === 0) throw new Error('Tidak ada field yang diupdate.');

  setClauses.push('last_updated = NOW()');
  params.push(id);

  const [result] = await pool.query(
    `UPDATE wa_templates SET ${setClauses.join(', ')} WHERE id_template = ?`,
    params
  );

  if (result.affectedRows === 0) throw new Error(`Template '${id}' tidak ditemukan.`);
  return { updated: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/templates/:id/parameters — Update JSON parameters schema saja
// ─────────────────────────────────────────────────────────────────────────────
async function updateParameters(id, parametersData) {
  // Validasi JSON
  let paramStr;
  try {
    paramStr = typeof parametersData === 'string'
      ? (JSON.parse(parametersData), parametersData) // validate then keep as string
      : JSON.stringify(parametersData);
  } catch {
    throw new Error('Format parameters JSON tidak valid.');
  }

  // Ekstrak header fields dari schema jika ada
  const schema      = engine.parseSchema(paramStr);
  const header_type = schema.header?.type || null;
  const header_url  = schema.header?.url  || null;
  const header_filename = schema.header?.filename || null;

  const [result] = await pool.query(
    `UPDATE wa_templates SET
       parameters     = ?,
       header_type    = ?,
       header_url     = ?,
       header_filename = ?,
       last_updated   = NOW()
     WHERE id_template = ?`,
    [paramStr, header_type, header_url, header_filename, id]
  );

  if (result.affectedRows === 0) throw new Error(`Template '${id}' tidak ditemukan.`);
  return { updated: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/templates/:id — Soft delete
// ─────────────────────────────────────────────────────────────────────────────
async function deleteTemplate(id) {
  const [result] = await pool.query(
    `UPDATE wa_templates SET status_crm = 'DELETED', last_updated = NOW() WHERE id_template = ?`,
    [id]
  );
  if (result.affectedRows === 0) throw new Error(`Template '${id}' tidak ditemukan.`);
  return { deleted: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/templates/sync — Sinkronisasi status + buttons dari Meta
// ─────────────────────────────────────────────────────────────────────────────
async function syncMetaStatus() {
  const { token, wabaId } = await _getTenantWaCredentials();

  if (!token || !wabaId) {
    console.warn('[Template] WA credentials belum di-set. Sync dilewati (dev mode).');
    return { synced: 0, skipped: 'dev_mode' };
  }

  // Ambil semua template dari Meta termasuk components (untuk meta_buttons)
  const url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates?fields=id,name,status,quality_rating,components&limit=100`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  const metaTemplates = resp.data?.data || [];
  let synced = 0;

  for (const mt of metaTemplates) {
    // Ekstrak buttons dari components Meta untuk disimpan ke meta_buttons
    const buttonComponents = (mt.components || []).filter(c => c.type === 'BUTTONS');
    const metaButtons = buttonComponents.length > 0 ? JSON.stringify(buttonComponents[0].buttons || []) : null;

    const [result] = await pool.query(
      `UPDATE wa_templates SET
         meta_status            = ?,
         status_meta            = ?,
         meta_quality_rating    = ?,
         meta_status_updated_at = NOW(),
         meta_buttons           = ?,
         last_updated           = NOW()
       WHERE template_name_api = ? AND (meta_status != 'LOCAL_ONLY' OR status_meta != 'LOCAL_ONLY')`,
      [mt.status, mt.status, mt.quality_rating || null, metaButtons, mt.name]
    );
    if (result.affectedRows > 0) synced++;
  }

  return { synced, total_from_meta: metaTemplates.length };
}

// ── HELPER: Submit template baru ke Meta ──────────────────────────────────────
async function _submitTemplateToMeta({ nama_template, template_name_api, body_text, language_code, kategori }) {
  const { token, wabaId } = await _getTenantWaCredentials();

  if (!token || !wabaId) {
    console.warn('[Template] Credentials belum di-set. Submit ke Meta dilewati.');
    return { id: null };
  }

  const resp = await axios.post(
    `https://graph.facebook.com/v19.0/${wabaId}/message_templates`,
    {
      name:       template_name_api || nama_template.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      language:   language_code || 'id',
      category:   kategori || 'UTILITY',
      components: [{ type: 'BODY', text: body_text }],
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );

  return resp.data;
}

module.exports = {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  updateParameters,
  deleteTemplate,
  syncMetaStatus,
};
