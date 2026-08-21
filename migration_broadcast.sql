-- ==========================================================
-- MIGRATION: Modul Broadcast — Tabel broadcast_campaigns
-- Database Target: DB Tenant (u294320793_crmdemo)
-- Jalankan sekali saja di DB tenant masing-masing
-- ==========================================================

-- Tabel riwayat campaign broadcast (header)
-- broadcast_queue sudah ada (dikelola GAS Worker) — JANGAN dibuat ulang
CREATE TABLE IF NOT EXISTS `broadcast_campaigns` (
  `id`               VARCHAR(60)  NOT NULL PRIMARY KEY,
  `nama_campaign`    VARCHAR(150) NOT NULL DEFAULT 'Campaign Broadcast',
  `created_by`       VARCHAR(100) NOT NULL,
  `meta_template_id` VARCHAR(100) NULL COMMENT 'ID template Meta (SW Tertutup)',
  `crm_template_id`  VARCHAR(100) NULL COMMENT 'ID template CRM internal (SW Terbuka)',
  `target_count`     INT          NOT NULL DEFAULT 0,
  `sent_count`       INT          NOT NULL DEFAULT 0,
  `status`           ENUM('pending','in_progress','completed','failed') NOT NULL DEFAULT 'pending',
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_status`     (`status`),
  INDEX `idx_created_by` (`created_by`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ==========================================================
-- Cek apakah broadcast_queue sudah ada (jangan dibuat ulang)
-- Jalankan SELECT berikut untuk verifikasi:
-- ==========================================================
-- SELECT TABLE_NAME FROM information_schema.TABLES
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 'broadcast_queue';


-- ==========================================================
-- Jika broadcast_queue BELUM ADA di DB (edge case):
-- Buat dengan schema minimal yang kompatibel dengan GAS Worker
-- Uncomment hanya jika diperlukan!
-- ==========================================================
-- CREATE TABLE IF NOT EXISTS `broadcast_queue` (
--   `id`             VARCHAR(60)  NOT NULL PRIMARY KEY,
--   `broadcast_id`   VARCHAR(60)  NOT NULL,
--   `id_siswa`       VARCHAR(60)  NOT NULL,
--   `phone`          VARCHAR(20)  NOT NULL,
--   `template_id`    VARCHAR(100) NULL,
--   `template_type`  ENUM('meta','crm') NOT NULL DEFAULT 'meta',
--   `status`         ENUM('antri','proses','terkirim','gagal') NOT NULL DEFAULT 'antri',
--   `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
--   `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   INDEX `idx_broadcast_id` (`broadcast_id`),
--   INDEX `idx_status`       (`status`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ==========================================================
-- Tabel template CRM internal (opsional — fallback jika wa_templates kosong)
-- Bisa diisi manual oleh Admin lewat phpMyAdmin
-- ==========================================================
CREATE TABLE IF NOT EXISTS `broadcast_templates_crm` (
  `id`           VARCHAR(50)  NOT NULL PRIMARY KEY,
  `name`         VARCHAR(100) NOT NULL,
  `preview_text` TEXT         NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
