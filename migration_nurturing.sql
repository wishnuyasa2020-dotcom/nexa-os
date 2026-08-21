-- =============================================================================
-- MIGRATION: Modul Automated Nurturing & Smart Funnel
-- File: migration_nurturing.sql
-- Desc: Membuat tabel terpisah `siswa_nurturing_state` untuk menyimpan state
--       otomatisasi nurturing & snooze, terpisah dari siswa_periode agar
--       fleksibel lintas marketing period.
-- =============================================================================

-- Tabel utama: state automation per siswa
CREATE TABLE IF NOT EXISTS siswa_nurturing_state (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_siswa         VARCHAR(50) NOT NULL,
  marketing_period VARCHAR(20) NOT NULL DEFAULT '-',

  -- ── Nurturing Probing (Calon Prospek) ───────────────────────────
  is_in_campaign       TINYINT(1)  NOT NULL DEFAULT 0    COMMENT '1 jika sedang dalam antrean probing',
  probe_level          TINYINT     NOT NULL DEFAULT 0    COMMENT '0 = belum mulai, 1-5 = level probe terkirim',
  last_probe_sent_at   DATETIME    NULL                  COMMENT 'Timestamp template probe terakhir dikirim',

  -- ── Snooze Campaign (Data Masuk - Tunda) ────────────────────────
  snooze_until         DATETIME    NULL                  COMMENT 'Kapan siswa akan dibangunkan kembali (NOW + 90 hari)',
  snooze_level         TINYINT     NOT NULL DEFAULT 0    COMMENT '0-3: level snooze campaign yang sudah terkirim',

  -- ── Metadata ────────────────────────────────────────────────────
  created_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Satu siswa hanya punya satu state per period
  UNIQUE KEY uq_siswa_period (id_siswa, marketing_period),
  INDEX idx_in_campaign (is_in_campaign, probe_level),
  INDEX idx_snooze_until (snooze_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='State otomatisasi nurturing & snooze per siswa';

-- Tabel log aktivitas otomasi (terpisah dari aktivitas_siswa manual)
CREATE TABLE IF NOT EXISTS nurturing_activity_log (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_siswa        VARCHAR(50) NOT NULL,
  activity_type   VARCHAR(100) NOT NULL  COMMENT 'e.g., Auto-Probing WhatsApp, Auto-Snooze WhatsApp',
  result          VARCHAR(200) NULL      COMMENT 'e.g., Naik Probe 2, Gugur Kualifikasi',
  notes           TEXT NULL              COMMENT 'Narasi detail log',
  triggered_by    VARCHAR(100) NULL      COMMENT 'cron | webhook | manual:<user>',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_siswa (id_siswa),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Log aktivitas otomasi nurturing & snooze';

SELECT 'Migration nurturing selesai.' AS status;
