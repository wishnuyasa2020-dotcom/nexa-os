'use strict';

/**
 * lifecycle.constants.js
 * Sumber kebenaran baku 8 Canonical Lifecycle States & Tenant Vocabulary Mapping v2 NexaMOS.
 * Sesuai pedoman: ONTHOLOGY.md, AGENTS.md, dan NexaMOS_Canonical_Lifecycle_Tenant_Mapping_v2.md
 */

const CANONICAL_STATES = Object.freeze({
  AUDIENCE: 'AUDIENCE',
  KNOWN_PROFILE: 'KNOWN_PROFILE',
  LEAD: 'LEAD',
  PROSPECT: 'PROSPECT',
  OPPORTUNITY: 'OPPORTUNITY',
  REGISTERED: 'REGISTERED',
  CUSTOMER: 'CUSTOMER',
  POST_CUSTOMER: 'POST_CUSTOMER'
});

const CANONICAL_STATE_PIPELINE = Object.freeze([
  CANONICAL_STATES.AUDIENCE,
  CANONICAL_STATES.KNOWN_PROFILE,
  CANONICAL_STATES.LEAD,
  CANONICAL_STATES.PROSPECT,
  CANONICAL_STATES.OPPORTUNITY,
  CANONICAL_STATES.REGISTERED,
  CANONICAL_STATES.CUSTOMER,
  CANONICAL_STATES.POST_CUSTOMER
]);

/**
 * Pemetaan Domain Vocabulary per Tipe Tenant:
 * - LPK (Derma & institusi vokasi/magang kerja)
 * - General (Bisnis umum, SaaS, B2B, retail)
 */
const TENANT_VOCABULARIES = Object.freeze({
  lpk: {
    [CANONICAL_STATES.AUDIENCE]: 'Siswa Dingin',
    [CANONICAL_STATES.KNOWN_PROFILE]: 'Siswa Teridentifikasi',
    [CANONICAL_STATES.LEAD]: 'Siswa Hangat',
    [CANONICAL_STATES.PROSPECT]: 'Siswa Potensial',
    [CANONICAL_STATES.OPPORTUNITY]: 'Siswa Serius',
    [CANONICAL_STATES.REGISTERED]: 'Siswa Terdaftar',
    [CANONICAL_STATES.CUSTOMER]: 'Siswa / Peserta',
    [CANONICAL_STATES.POST_CUSTOMER]: 'Alumni'
  },
  general: {
    [CANONICAL_STATES.AUDIENCE]: 'Kontak Dingin',
    [CANONICAL_STATES.KNOWN_PROFILE]: 'Kontak Teridentifikasi',
    [CANONICAL_STATES.LEAD]: 'Kontak Hangat',
    [CANONICAL_STATES.PROSPECT]: 'Kontak Potensial',
    [CANONICAL_STATES.OPPORTUNITY]: 'Kontak Serius',
    [CANONICAL_STATES.REGISTERED]: 'Kontak Terdaftar',
    [CANONICAL_STATES.CUSTOMER]: 'Pelanggan',
    [CANONICAL_STATES.POST_CUSTOMER]: 'Mantan Pelanggan'
  }
});

/**
 * Dimensi Kualitas/Perilaku Hubungan (Behavioral Dimension)
 * Terpisah dari Lifecycle State (Bagian 6 Ontologi v2).
 */
const RELATIONSHIP_LEVELS = Object.freeze({
  STANDARD: 'STANDARD',
  LOYAL: 'LOYAL',
  ADVOCATE: 'ADVOCATE'
});

/**
 * Normalisasi fleksibel string input/database ke nilai Canonical State.
 * Menjamin kompatibilitas dengan data warisan (legacy) seperti 'Registered Opportunity', 'Known', dll.
 */
function normalizeLifecycleState(input) {
  if (!input) return CANONICAL_STATES.LEAD;
  const cleaned = String(input).trim().toUpperCase();
  if (!cleaned) return CANONICAL_STATES.LEAD;

  switch (cleaned) {
    case 'AUDIENCE':
      return CANONICAL_STATES.AUDIENCE;
    case 'KNOWN':
    case 'KNOWN PROFILE':
    case 'KNOWN_PROFILE':
      return CANONICAL_STATES.KNOWN_PROFILE;
    case 'LEAD':
      return CANONICAL_STATES.LEAD;
    case 'PROSPECT':
      return CANONICAL_STATES.PROSPECT;
    case 'OPPORTUNITY':
      return CANONICAL_STATES.OPPORTUNITY;
    case 'REGISTERED':
    case 'REGISTERED OPPORTUNITY':
    case 'REGISTERED_OPPORTUNITY':
    case 'TERDAFTAR FORMULIR':
      return CANONICAL_STATES.REGISTERED;
    case 'CUSTOMER':
      return CANONICAL_STATES.CUSTOMER;
    case 'POST_CUSTOMER':
    case 'POST CUSTOMER':
    case 'POSTCUSTOMER':
    case 'ALUMNI':
    case 'MANTAN PELANGGAN':
      return CANONICAL_STATES.POST_CUSTOMER;
    case 'DISQUALIFIED':
    case 'TIDAK LANJUT':
      return 'Disqualified';
    default:
      // Fallback preserve atau default ke LEAD
      if (CANONICAL_STATE_PIPELINE.includes(cleaned)) return cleaned;
      return CANONICAL_STATES.LEAD;
  }
}

/**
 * Mendapatkan display label adaptif berdasarkan tipe tenant
 */
function getDisplayLabel(canonicalState, tenantType = 'lpk') {
  const normState = normalizeLifecycleState(canonicalState);
  const vocab = TENANT_VOCABULARIES[tenantType] || TENANT_VOCABULARIES.lpk;
  return vocab[normState] || normState;
}

/**
 * Mendapatkan display gabungan Lifecycle State + Behavioral Dimension (Bagian 6 Ontologi v2)
 * Contoh:
 * - LPK: "Alumni — Advocate"
 * - Non-LPK: "Pelanggan Loyal"
 */
function getCompositeDisplayLabel(canonicalState, relationshipLevel = 'STANDARD', tenantType = 'lpk') {
  const baseLabel = getDisplayLabel(canonicalState, tenantType);
  const level = String(relationshipLevel || 'STANDARD').toUpperCase().trim();

  if (level === RELATIONSHIP_LEVELS.ADVOCATE) {
    return tenantType === 'lpk' ? `${baseLabel} — Advocate` : `${baseLabel} Advokat`;
  }
  if (level === RELATIONSHIP_LEVELS.LOYAL) {
    return tenantType === 'lpk' ? `${baseLabel} Loyal` : `${baseLabel} Loyal`;
  }
  return baseLabel;
}

module.exports = {
  CANONICAL_STATES,
  CANONICAL_STATE_PIPELINE,
  TENANT_VOCABULARIES,
  RELATIONSHIP_LEVELS,
  normalizeLifecycleState,
  getDisplayLabel,
  getCompositeDisplayLabel
};
