-- ============================================================
-- Migration: wa_templates v2
-- Target: DB Tenant (u294320793_crmdemo, dst.)
-- 
-- Perubahan:
--   1. Tambah kolom pendukung Template Engine (header, bsuid)
--   2. Fix: Harmonisasi status_meta (DB lama GAS) → meta_status (backend baru)
--   3. Fix tipe meta_status_updated_at dari varchar ke datetime
--   4. Tambah index untuk performa filter
-- ============================================================

-- 1. Tambah kolom baru (gunakan IF NOT EXISTS agar idempotent/aman dijalankan ulang)
ALTER TABLE `wa_templates`
  ADD COLUMN IF NOT EXISTS `meta_buttons`      JSON          NULL        COMMENT 'Hasil sync components/buttons dari Meta (read-only, untuk preview UI)',
  ADD COLUMN IF NOT EXISTS `header_type`       VARCHAR(20)   NULL        COMMENT 'none | text | image | video | document',
  ADD COLUMN IF NOT EXISTS `header_url`        TEXT          NULL        COMMENT 'URL media untuk header image/video/document',
  ADD COLUMN IF NOT EXISTS `header_filename`   VARCHAR(255)  NULL        COMMENT 'Nama file untuk header document (opsional)',
  ADD COLUMN IF NOT EXISTS `supports_bsuid`    TINYINT(1)    NOT NULL DEFAULT 0 COMMENT 'Flag: template bisa dikirim via BSUID',
  ADD COLUMN IF NOT EXISTS `meta_status`       VARCHAR(20)   NULL        COMMENT 'APPROVED | PENDING | REJECTED | LOCAL_ONLY';

-- 2. Sinkronisasi data: copy status_meta (nama lama GAS) ke meta_status (nama baru backend)
UPDATE `wa_templates`
  SET `meta_status` = `status_meta`
  WHERE `meta_status` IS NULL AND `status_meta` IS NOT NULL;

-- 3. Default fallback untuk baris yang masih NULL
UPDATE `wa_templates` SET `meta_status` = 'LOCAL_ONLY' WHERE `meta_status` IS NULL;
UPDATE `wa_templates` SET `status_crm`  = 'ACTIVE'     WHERE `status_crm` IS NULL;

-- 4. Fix tipe kolom meta_status_updated_at: varchar → datetime
--    Null-kan dulu nilai yang tidak valid sebagai datetime string
UPDATE `wa_templates`
  SET `meta_status_updated_at` = NULL
  WHERE `meta_status_updated_at` = '' 
     OR `meta_status_updated_at` NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}';

ALTER TABLE `wa_templates`
  MODIFY COLUMN `meta_status_updated_at` DATETIME NULL COMMENT 'Waktu terakhir status dari Meta diperbarui';

-- 5. Index untuk performa (IF NOT EXISTS aman di MySQL 8+)
CREATE INDEX IF NOT EXISTS `idx_wa_templates_meta_status` ON `wa_templates`(`meta_status`);
CREATE INDEX IF NOT EXISTS `idx_wa_templates_status_crm`  ON `wa_templates`(`status_crm`);
CREATE INDEX IF NOT EXISTS `idx_wa_templates_pipeline`     ON `wa_templates`(`pipeline`);

-- 6. Verifikasi
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wa_templates'
ORDER BY ORDINAL_POSITION;
