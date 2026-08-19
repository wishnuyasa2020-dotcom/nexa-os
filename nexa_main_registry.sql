-- ==========================================================
-- NEXA OS - MAIN REGISTRY DATABASE (Phase 3)
-- Database Name: nexa_main_registry
-- ==========================================================
-- (Buat database ini secara manual di dashboard Hostinger)
-- ==========================================================


-- 1. Tabel Admin Users (Command Centre)
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `nama_lengkap` VARCHAR(100),
  `role` ENUM('SuperAdmin', 'Support') DEFAULT 'Support',
  `status` ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
  `last_login` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Tabel Tenants (Daftar Klien)
CREATE TABLE IF NOT EXISTS `tenants` (
  `tenant_id` VARCHAR(50) PRIMARY KEY, -- ex: 'derma-indonesia'
  `brand_name` VARCHAR(100) NOT NULL,  -- ex: 'Derma Indonesia'
  `tier` ENUM('FREE', 'BASIC', 'PRO', 'ENTERPRISE') DEFAULT 'FREE',
  `status` ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED') DEFAULT 'ACTIVE',
  
  -- Konfigurasi Kapasitas
  `max_cro` INT DEFAULT 1,
  
  -- Konfigurasi Integrasi Meta API (WhatsApp BYOW)
  `whatsapp_phone_id` VARCHAR(50) NULL,
  `whatsapp_waba_id` VARCHAR(50) NULL,
  `whatsapp_access_token` TEXT NULL,
  `meta_app_id` VARCHAR(50) NULL,
  
  -- Konfigurasi Hostinger & Domain
  `hostinger_account_id` VARCHAR(100) NULL,
  `custom_domain` VARCHAR(100) NULL, -- ex: 'crm.dermaindonesia.com'
  `webhook_secret` VARCHAR(100) NULL, -- Untuk validasi webhook dari Meta
  
  -- Periode Tagihan Aktif
  `current_period_start` DATE NULL,
  `current_period_end` DATE NULL,
  
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Tabel Tenant Databases (Dynamic Routing)
CREATE TABLE IF NOT EXISTS `tenant_databases` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(50) NOT NULL,
  
  -- Hostinger Database Credentials
  `db_host` VARCHAR(100) NOT NULL DEFAULT 'localhost',
  `db_port` INT DEFAULT 3306,
  `db_name` VARCHAR(100) NOT NULL,
  `db_user` VARCHAR(100) NOT NULL,
  `db_password` VARCHAR(255) NOT NULL,
  
  -- Hostinger cPanel / Control Panel Ref
  `hostinger_cpanel_url` VARCHAR(255) NULL,
  
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`tenant_id`) ON DELETE CASCADE
);

-- 4. Tabel Plan Features (Feature Control per Tier)
CREATE TABLE IF NOT EXISTS `plan_features` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tier` ENUM('FREE', 'BASIC', 'PRO', 'ENTERPRISE') NOT NULL,
  `feature_code` VARCHAR(50) NOT NULL, -- ex: 'custom_domain'
  `is_enabled` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_tier_feature` (`tier`, `feature_code`)
);

-- 5. Tabel Billing History (Riwayat Tagihan Klien)
CREATE TABLE IF NOT EXISTS `billing_history` (
  `invoice_id` VARCHAR(50) PRIMARY KEY, -- ex: 'INV-202608-DERMA'
  `tenant_id` VARCHAR(50) NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('UNPAID', 'PAID', 'OVERDUE', 'CANCELLED') DEFAULT 'UNPAID',
  `billing_period_start` DATE NOT NULL,
  `billing_period_end` DATE NOT NULL,
  `due_date` DATE NOT NULL,
  `payment_date` TIMESTAMP NULL,
  `invoice_url` VARCHAR(255) NULL,
  
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`tenant_id`) ON DELETE CASCADE
);

-- ==========================================================
-- DUMMY DATA INISIAL (Derma Indonesia)
-- ==========================================================

INSERT INTO `admin_users` (`username`, `password_hash`, `nama_lengkap`, `role`) VALUES 
('wishnu', 'hash_dari_password', 'Wishnu Wijaya', 'SuperAdmin');

INSERT INTO `tenants` (`tenant_id`, `brand_name`, `tier`, `status`, `max_cro`, `custom_domain`) VALUES
('derma-indonesia', 'Derma Indonesia', 'PRO', 'ACTIVE', 10, 'crm.dermaindonesia.com');

INSERT INTO `tenant_databases` (`tenant_id`, `db_host`, `db_port`, `db_name`, `db_user`, `db_password`) VALUES
('derma-indonesia', 'srv1412.hstgr.io', 3306, 'u294320793_crmdemo', 'u294320793_admindemo', '1379502026Ok!');

INSERT INTO `billing_history` (`invoice_id`, `tenant_id`, `amount`, `status`, `billing_period_start`, `billing_period_end`, `due_date`, `payment_date`) VALUES
('INV-202608-DERMA', 'derma-indonesia', 1500000.00, 'PAID', '2026-08-01', '2026-08-31', '2026-08-10', '2026-08-09 10:00:00');

-- Fitur Default PRO
INSERT INTO `plan_features` (`tier`, `feature_code`, `is_enabled`) VALUES
('PRO', 'school_crm', 1),
('PRO', 'student_crm', 1),
('PRO', 'whatsapp_integration', 1),
('PRO', 'broadcast', 1),
('PRO', 'nurturing', 1),
('PRO', 'advanced_reports', 1),
('PRO', 'custom_domain', 0); -- Belum aktif secara sistem
