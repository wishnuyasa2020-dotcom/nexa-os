'use strict';

/**
 * templateEngine.service.js
 * ============================================================
 * Port dari WhatsAppTemplateEngine.gs (Google Apps Script) ke Node.js
 *
 * Engine terpusat untuk mem-parsing skema JSON dari kolom `parameters`
 * di tabel wa_templates dan menghasilkan array `components` yang valid
 * sesuai spesifikasi Meta Cloud API.
 *
 * FITUR:
 *  - Parse JSON schema (format baru, robust)
 *  - Fallback backward-compatibility untuk format string lama
 *  - Support semua tipe Header Meta: text, image, video, document
 *  - Body dengan N variabel dinamis
 *  - Button dinamis (url, quick_reply, phone_number)
 *  - Validasi: fail-safe jika parameter wajib kosong
 *  - resolvePreview(): substitusi {{1}}, {{2}} untuk preview di UI
 *
 * FORMAT JSON SCHEMA (kolom `parameters`):
 * ─────────────────────────────────────────────────────────────
 *  Body saja:
 *    {"body":["STUDENT_NAME"]}
 *
 *  Body 2 variabel:
 *    {"body":["STUDENT_NAME","SCHOOL_NAME"]}
 *
 *  Header teks dinamis:
 *    {"header":{"type":"text","params":["STUDENT_NAME"]},"body":["STUDENT_NAME"]}
 *
 *  Header gambar statis:
 *    {"header":{"type":"image","url":"https://..."},"body":["STUDENT_NAME"]}
 *
 *  Header video:
 *    {"header":{"type":"video","url":"https://..."},"body":["STUDENT_NAME"]}
 *
 *  Header dokumen:
 *    {"header":{"type":"document","url":"https://...","filename":"Panduan.pdf"},"body":[]}
 *
 *  Template statis (tanpa variabel):
 *    {"body":[]}
 *
 * CONTEXT OBJECT (variabel dinamis):
 *    {
 *      namaSiswa:   'Budi Santoso',
 *      namaSekolah: 'SMA Negeri 1 Jakarta',
 *      idSiswa:     'SIS-000001',
 *      // tambahkan variabel baru sesuai kebutuhan
 *    }
 * ============================================================
 */

// ── Daftar variabel yang dikenal engine ───────────────────────────────────────
const KNOWN_VARIABLES = {
  STUDENT_NAME:      (ctx) => String(ctx.namaSiswa   || '').trim(),
  SCHOOL_NAME:       (ctx) => String(ctx.namaSekolah || '').trim(),
  STUDENT_ID:        (ctx) => String(ctx.idSiswa     || '').trim(),
  // ── Tambahkan variabel baru di sini ───────────────────────
  // CONSULTATION_DATE: (ctx) => String(ctx.consultationDate || '').trim(),
  // HOME_VISIT_DATE:   (ctx) => String(ctx.homeVisitDate    || '').trim(),
  // REGISTRATION_FEE:  (ctx) => String(ctx.registrationFee  || '').trim(),
  // ──────────────────────────────────────────────────────────
};

// ── Resolve satu variabel ke nilainya ─────────────────────────────────────────
/**
 * @param {string} varName - Nama variabel UPPERCASE (e.g. 'STUDENT_NAME')
 * @param {Object} context - Data siswa
 * @returns {{ success: boolean, value?: string, message?: string }}
 */
function _resolveVariable(varName, context) {
  const ctx = context || {};
  const resolver = KNOWN_VARIABLES[varName];

  if (!resolver) {
    return {
      success: false,
      message: `Variabel '${varName}' tidak dikenal di engine. Daftarkan di templateEngine.service.js → KNOWN_VARIABLES.`,
    };
  }

  return { success: true, value: resolver(ctx) };
}

// ── Resolve array variabel → array Meta text parameters ───────────────────────
function _resolveVarArray(varNames, context, componentLabel) {
  if (!varNames || varNames.length === 0) return { success: true, params: [] };

  const resolved = [];
  for (let i = 0; i < varNames.length; i++) {
    const name   = String(varNames[i] || '').trim().toUpperCase();
    if (!name) continue;

    const result = _resolveVariable(name, context);
    if (!result.success) {
      return { success: false, message: result.message };
    }
    if (!result.value) {
      return {
        success: false,
        message: `Variabel '${name}' (${componentLabel} param #${i + 1}) kosong untuk siswa ini. Pesan tidak dikirim.`,
      };
    }
    resolved.push({ type: 'text', text: result.value });
  }

  return { success: true, params: resolved };
}

// ── Parse format lama (backward-compat) ───────────────────────────────────────
function _parseLegacySemicolonFormat(raw) {
  const schema = { body: [], buttons: [] };
  const parts  = raw.toUpperCase().split(';');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1) {
      const compType  = trimmed.substring(0, colonIdx).trim();
      const paramsStr = trimmed.substring(colonIdx + 1).trim();
      if (compType === 'BODY') {
        schema.body = paramsStr.split(',').map(n => n.trim()).filter(Boolean);
      }
      // Header legacy tidak bisa di-infer otomatis → skip
    } else {
      const names = trimmed.split(',').map(n => n.trim()).filter(Boolean);
      schema.body = schema.body.concat(names);
    }
  }

  return schema;
}

// ── Parse JSON schema dari string kolom `parameters` ─────────────────────────
/**
 * @param {string} parametersRaw - Raw string dari kolom parameters di DB
 * @returns {{ header?: Object, body: string[], buttons?: Object[] }}
 */
function parseSchema(parametersRaw) {
  const raw = String(parametersRaw || '').trim();

  // Kosong atau 'NONE' → template statis tanpa variabel
  if (!raw || raw.toUpperCase() === 'NONE') return { body: [] };

  // Coba parse JSON (format baru)
  if (raw.charAt(0) === '{') {
    try {
      const parsed = JSON.parse(raw);
      // Normalisasi body → selalu array of UPPERCASE strings
      if (!parsed.body) parsed.body = [];
      if (!Array.isArray(parsed.body)) parsed.body = [parsed.body];
      parsed.body = parsed.body.map(v => String(v).trim().toUpperCase());

      // Normalisasi header.params
      if (parsed.header && parsed.header.params) {
        if (!Array.isArray(parsed.header.params)) parsed.header.params = [parsed.header.params];
        parsed.header.params = parsed.header.params.map(v => String(v).trim().toUpperCase());
      }

      // Normalisasi buttons
      if (!parsed.buttons || !Array.isArray(parsed.buttons)) parsed.buttons = [];

      return parsed;
    } catch (e) {
      console.warn(`[TemplateEngine] WARN: Gagal parse JSON, fallback ke legacy. Error: ${e.message}`);
    }
  }

  // Fallback: format string legacy
  if (raw.includes(';') || raw.includes(':')) {
    return _parseLegacySemicolonFormat(raw);
  }

  // Format paling sederhana: 'STUDENT_NAME,SCHOOL_NAME'
  const names = raw.split(',').map(n => n.trim().toUpperCase()).filter(Boolean);
  return { body: names };
}

// ── Build Meta API Components dari schema + context ───────────────────────────
/**
 * @param {Object} schema  - Hasil parseSchema()
 * @param {Object} context - Data siswa { namaSiswa, namaSekolah, idSiswa }
 * @returns {{ success: boolean, components?: Array, message?: string }}
 */
function buildComponents(schema, context) {
  const ctx        = context || {};
  const components = [];

  // ── 1. HEADER ──────────────────────────────────────────────────────────────
  if (schema.header) {
    const header     = schema.header;
    const headerType = String(header.type || '').toLowerCase();

    if (headerType === 'text') {
      const headerVars = header.params || [];
      if (headerVars.length > 0) {
        const hResolved = _resolveVarArray(headerVars, ctx, 'header');
        if (!hResolved.success) return { success: false, message: hResolved.message };
        if (hResolved.params.length > 0) {
          components.push({ type: 'header', parameters: hResolved.params });
        }
      }

    } else if (headerType === 'image') {
      const imageUrl = String(header.url || '').trim();
      if (!imageUrl) {
        return { success: false, message: 'Header tipe "image" butuh properti "url" di schema JSON.' };
      }
      components.push({ type: 'header', parameters: [{ type: 'image', image: { link: imageUrl } }] });

    } else if (headerType === 'video') {
      const videoUrl = String(header.url || '').trim();
      if (!videoUrl) {
        return { success: false, message: 'Header tipe "video" butuh properti "url" di schema JSON.' };
      }
      components.push({ type: 'header', parameters: [{ type: 'video', video: { link: videoUrl } }] });

    } else if (headerType === 'document') {
      const docUrl = String(header.url || '').trim();
      if (!docUrl) {
        return { success: false, message: 'Header tipe "document" butuh properti "url" di schema JSON.' };
      }
      const docParam = { type: 'document', document: { link: docUrl } };
      if (header.filename) docParam.document.filename = String(header.filename).trim();
      components.push({ type: 'header', parameters: [docParam] });

    } else if (headerType) {
      console.warn(`[TemplateEngine] WARN: Tipe header tidak dikenal: "${headerType}". Dilewati.`);
    }
  }

  // ── 2. BODY ────────────────────────────────────────────────────────────────
  const bodyVars = schema.body || [];
  if (bodyVars.length > 0) {
    const bResolved = _resolveVarArray(bodyVars, ctx, 'body');
    if (!bResolved.success) return { success: false, message: bResolved.message };
    if (bResolved.params.length > 0) {
      components.push({ type: 'body', parameters: bResolved.params });
    }
  }

  // ── 3. BUTTONS ─────────────────────────────────────────────────────────────
  if (schema.buttons && Array.isArray(schema.buttons)) {
    for (let bi = 0; bi < schema.buttons.length; bi++) {
      const btn     = schema.buttons[bi];
      const btnType = String(btn.type || '').toLowerCase();
      const btnComp = {
        type:     'button',
        sub_type: btnType,
        index:    String(btn.index !== undefined ? btn.index : bi),
      };

      if (btnType === 'url' && btn.url_suffix_var) {
        const suffixResult = _resolveVariable(String(btn.url_suffix_var).toUpperCase(), ctx);
        if (!suffixResult.success) return { success: false, message: suffixResult.message };
        btnComp.parameters = [{ type: 'text', text: suffixResult.value || '' }];
        components.push(btnComp);

      } else if (btnType === 'quick_reply' && btn.payload_var) {
        const payloadResult = _resolveVariable(String(btn.payload_var).toUpperCase(), ctx);
        if (!payloadResult.success) return { success: false, message: payloadResult.message };
        btnComp.parameters = [{ type: 'payload', payload: payloadResult.value || '' }];
        components.push(btnComp);
      }
      // Static buttons (phone_number, url tanpa suffix) tidak butuh parameter extra
    }
  }

  return { success: true, components };
}

// ── resolve(): fungsi all-in-one utama ────────────────────────────────────────
/**
 * Parse schema dari string kolom parameters, lalu build Meta API components.
 * Ini fungsi utama yang dipanggil oleh broadcast.service, chat.service, dll.
 *
 * @param {string} parametersStr - Nilai kolom parameters dari DB
 * @param {Object} context       - Data siswa { namaSiswa, namaSekolah, idSiswa }
 * @returns {{ success: boolean, components?: Array, message?: string }}
 */
function resolve(parametersStr, context) {
  try {
    const schema = parseSchema(parametersStr);
    return buildComponents(schema, context || {});
  } catch (e) {
    const errMsg = `Exception di engine: ${e.message}`;
    console.error(`[TemplateEngine] ERROR: ${errMsg}`);
    return { success: false, message: errMsg };
  }
}

// ── resolvePreview(): substitusi {{1}} {{2}} untuk preview di UI ──────────────
/**
 * Menghasilkan teks body dengan placeholder {{1}}, {{2}} sudah disubstitusi.
 * Digunakan untuk Smart Composer, Broadcast preview, dan log chat.
 *
 * @param {string} bodyText      - Teks body template (berisi {{1}}, {{2}}, ...)
 * @param {string} parametersStr - Nilai kolom parameters dari DB
 * @param {Object} context       - Data siswa
 * @returns {string} Teks dengan placeholder diganti nilai riil
 */
function resolvePreview(bodyText, parametersStr, context) {
  let text = String(bodyText || '');
  const ctx = context || {};

  try {
    const schema   = parseSchema(parametersStr);
    const bodyVars = schema.body || [];

    for (let i = 0; i < bodyVars.length; i++) {
      const varName     = String(bodyVars[i] || '').trim().toUpperCase();
      if (!varName) continue;
      const placeholder = `{{${i + 1}}}`;
      const result      = _resolveVariable(varName, ctx);
      const value       = result.success ? (result.value || `[${varName}]`) : `<${varName}>`;
      // Replace semua kemunculan placeholder
      text = text.split(placeholder).join(value);
    }
  } catch (e) {
    console.error(`[TemplateEngine] resolvePreview error: ${e.message}`);
  }

  return text;
}

// ── getResolvedTemplateBody(): untuk digunakan oleh webhook handler ───────────
/**
 * Substitusi body text berdasarkan components array yang sudah dibangun.
 * Berguna untuk menyimpan preview teks ke chat_messages.
 *
 * @param {string} bodyText  - Raw body text dari DB
 * @param {Array}  components - Components array hasil buildComponents()
 * @returns {string}
 */
function getResolvedTemplateBody(bodyText, components) {
  let text = String(bodyText || '');

  if (components && Array.isArray(components)) {
    const bodyComp = components.find(c => c.type === 'body');
    if (bodyComp && bodyComp.parameters) {
      bodyComp.parameters.forEach((param, pi) => {
        const placeholder = `{{${pi + 1}}}`;
        text = text.split(placeholder).join(param.text || '');
      });
    }
  }

  return text;
}

// ── migrateToJsonFormat(): konversi format lama → JSON baru ──────────────────
/**
 * Digunakan saat admin klik "Migrate" di UI atau saat migration batch.
 * @param {string} oldParamStr - String lama
 * @returns {string} JSON string baru
 */
function migrateToJsonFormat(oldParamStr) {
  const raw = String(oldParamStr || '').trim();
  if (raw.charAt(0) === '{') return raw; // Sudah JSON
  if (!raw || raw.toUpperCase() === 'NONE') return '{"body":[]}';

  if (!raw.includes(';') && !raw.includes(':')) {
    const names = raw.split(',').map(n => n.trim().toUpperCase()).filter(Boolean);
    return JSON.stringify({ body: names });
  }

  const schema = _parseLegacySemicolonFormat(raw);
  return JSON.stringify({ body: schema.body });
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  parseSchema,
  buildComponents,
  resolve,
  resolvePreview,
  getResolvedTemplateBody,
  migrateToJsonFormat,
  KNOWN_VARIABLES, // expose untuk keperluan UI (daftar variabel yang tersedia)
};
