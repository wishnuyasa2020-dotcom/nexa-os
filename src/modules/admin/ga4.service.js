'use strict';

/**
 * Nexa OS — Superadmin GA4 Service
 * Mengambil ringkasan metrik live web Google Analytics 4 (GA4) Data API (v1beta)
 * untuk landing page NexaMOS (nexamos.cloud).
 */

const fs = require('fs');
const path = require('path');

// In-Memory Cache per Range (Default TTL: 5 Menit)
const gaCache = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Mendeteksi konfigurasi kredensial (Key File lokal atau Env Variables)
 */
function getCredentialsConfig() {
  const searchPaths = [
    path.join(__dirname, '../../../ga4.json'),
    path.join(__dirname, '../../ga4.json'),
    path.join(process.cwd(), 'ga4.json'),
    path.join(process.cwd(), '../ga4.json'),
  ];

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      return { keyFile: p };
    }
  }

  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  let privateKey = process.env.GA4_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n').trim();
    return {
      credentials: {
        client_email: clientEmail.trim(),
        private_key: privateKey,
      },
    };
  }

  return null;
}

/**
 * Memeriksa apakah kredensial GA4 sudah dikonfigurasi
 */
function isConfigured() {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const creds = getCredentialsConfig();
  return Boolean(propertyId && creds);
}

/**
 * Menyelesaikan konfigurasi rentang tanggal GA4
 */
function resolveDateRange(range = 'today') {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const startOfMonth = `${year}-${month}-01`;

  switch (range) {
    case 'yesterday':
      return { startDate: 'yesterday', endDate: 'yesterday', label: 'Kemarin' };
    case '7d':
      return { startDate: '7daysAgo', endDate: 'today', label: '7 Hari Terakhir' };
    case '30d':
      return { startDate: '30daysAgo', endDate: 'today', label: '30 Hari Terakhir' };
    case 'month':
      return { startDate: startOfMonth, endDate: 'today', label: 'Bulan Ini' };
    case 'today':
    default:
      return { startDate: 'today', endDate: 'today', label: 'Hari Ini' };
  }
}

/**
 * Mengambil ringkasan analitik GA4 dan top sumber trafik
 * @param {boolean} forceRefresh - jika true, lewati cache memori
 * @param {string} range - 'today' | 'yesterday' | '7d' | '30d' | 'month'
 */
async function getAnalyticsOverview(forceRefresh = false, range = 'today') {
  const normalizedRange = ['today', 'yesterday', '7d', '30d', 'month'].includes(range) ? range : 'today';
  const now = Date.now();
  const dateConfig = resolveDateRange(normalizedRange);

  // Kembalikan dari cache jika masih valid
  const cached = gaCache[normalizedRange];
  if (!forceRefresh && cached && (now - cached.cachedAt < CACHE_TTL_MS)) {
    return {
      ...cached.data,
      fromCache: true,
      cacheAgeSeconds: Math.floor((now - cached.cachedAt) / 1000),
    };
  }

  // Graceful fallback jika belum dikonfigurasi
  if (!isConfigured()) {
    return {
      configured: false,
      message: 'Kredensial GA4 (Property ID atau Service Account) belum dikonfigurasi.',
      range: normalizedRange,
      rangeLabel: dateConfig.label,
      summary: {
        activeUsers: 0,
        newUsers: 0,
        screenPageViews: 0,
        sessions: 0,
      },
      today: {
        activeUsers: 0,
        newUsers: 0,
        screenPageViews: 0,
        sessions: 0,
      },
      sources: [],
    };
  }

  try {
    const propertyId = process.env.GA4_PROPERTY_ID.trim();
    const credConfig = getCredentialsConfig();

    // Lazy load googleapis
    const { google } = require('googleapis');

    const auth = new google.auth.GoogleAuth({
      ...credConfig,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });

    const authClient = await auth.getClient();
    const analyticsData = google.analyticsdata({ version: 'v1beta', auth: authClient });

    // 1. Kueri Metrik Pengunjung Sesuai Rentang Tanggal
    const overviewPromise = analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: dateConfig.startDate, endDate: dateConfig.endDate }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'screenPageViews' },
          { name: 'sessions' },
        ],
      },
    });

    // 2. Kueri Top 5 Sumber Trafik Sesuai Rentang Tanggal
    const sourcesPromise = analyticsData.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: dateConfig.startDate, endDate: dateConfig.endDate }],
        dimensions: [
          { name: 'sessionDefaultChannelGroup' },
          { name: 'sessionSourceMedium' },
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
        ],
        orderBys: [
          { metric: { metricName: 'activeUsers' }, desc: true },
        ],
        limit: 5,
      },
    });

    const [overviewRes, sourcesRes] = await Promise.all([overviewPromise, sourcesPromise]);

    const overviewRow = overviewRes.data.rows?.[0];
    const activeUsers = parseInt(overviewRow?.metricValues?.[0]?.value || '0', 10);
    const newUsers = parseInt(overviewRow?.metricValues?.[1]?.value || '0', 10);
    const screenPageViews = parseInt(overviewRow?.metricValues?.[2]?.value || '0', 10);
    const sessions = parseInt(overviewRow?.metricValues?.[3]?.value || '0', 10);

    const sources = (sourcesRes.data.rows || []).map(row => {
      const channel = row.dimensionValues?.[0]?.value || 'Other';
      const sourceMedium = row.dimensionValues?.[1]?.value || '—';
      const users = parseInt(row.metricValues?.[0]?.value || '0', 10);
      const sess = parseInt(row.metricValues?.[1]?.value || '0', 10);
      return {
        channel,
        sourceMedium,
        activeUsers: users,
        sessions: sess,
      };
    });

    const result = {
      configured: true,
      error: false,
      propertyId,
      range: normalizedRange,
      rangeLabel: dateConfig.label,
      updatedAt: new Date().toISOString(),
      summary: {
        activeUsers,
        newUsers,
        screenPageViews,
        sessions,
      },
      // Backward compatibility untuk properti 'today'
      today: {
        activeUsers,
        newUsers,
        screenPageViews,
        sessions,
      },
      sources,
      fromCache: false,
    };

    // Simpan ke cache spesifik range
    gaCache[normalizedRange] = {
      data: result,
      cachedAt: Date.now(),
    };

    return result;
  } catch (err) {
    console.error(`[GA4 Service Error - ${normalizedRange}]`, err.message);
    return {
      configured: true,
      error: true,
      message: err.message || 'Terjadi kesalahan saat memanggil Google Analytics Data API.',
      range: normalizedRange,
      rangeLabel: dateConfig.label,
      summary: {
        activeUsers: 0,
        newUsers: 0,
        screenPageViews: 0,
        sessions: 0,
      },
      today: {
        activeUsers: 0,
        newUsers: 0,
        screenPageViews: 0,
        sessions: 0,
      },
      sources: [],
    };
  }
}

module.exports = {
  isConfigured,
  getAnalyticsOverview,
  resolveDateRange,
};
