-- ==========================================================
-- NEXA OS - MIGRATION SCRIPT (Tiering & Limits)
-- Run this on Hostinger database `u294320793_nexamain`
-- ==========================================================

-- 1. Modify `tenants` table to support new Tiering and Billing schemas
ALTER TABLE `tenants` 
  MODIFY COLUMN `tier` ENUM('FREE', 'PRO', 'BUSINESS', 'ENTERPRISE') DEFAULT 'FREE',
  ADD COLUMN `billing_cycle` ENUM('MONTHLY', 'YEARLY', 'LIFETIME') DEFAULT 'MONTHLY' AFTER `status`,
  ADD COLUMN `addon_cro` INT DEFAULT 0 AFTER `max_cro`,
  ADD COLUMN `limit_siswa` INT DEFAULT 300 AFTER `addon_cro`,
  ADD COLUMN `limit_sekolah` INT DEFAULT 10 AFTER `limit_siswa`,
  ADD COLUMN `used_siswa` INT DEFAULT 0 AFTER `limit_sekolah`,
  ADD COLUMN `used_sekolah` INT DEFAULT 0 AFTER `used_siswa`,
  ADD COLUMN `next_quota_reset` DATE NULL AFTER `used_sekolah`;

-- 2. Modify `plan_features` table
ALTER TABLE `plan_features`
  MODIFY COLUMN `tier` ENUM('FREE', 'PRO', 'BUSINESS', 'ENTERPRISE') NOT NULL;

-- 3. Update existing Dummy Data limits (if applicable)
UPDATE `tenants` 
SET 
  `billing_cycle` = 'MONTHLY',
  `limit_siswa` = 1000,
  `limit_sekolah` = 20
WHERE `tenant_id` = 'derma-indonesia' AND `tier` = 'PRO';

-- ==========================================================
-- Migration Complete
-- ==========================================================
