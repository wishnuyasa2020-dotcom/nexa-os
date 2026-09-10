-- ============================================================
-- Migration: Create db_pools (SaaS DB Pool Engine)
-- Database Target: u294320793_nexamain (Database Pusat)
-- Tujuan: Menampung pool database MySQL Hostinger yang sudah disiapkan
--         secara manual agar calon klien baru dapat melakukan Sign-Up
--         mandiri (Self-Service Onboarding) secara instan.
-- ============================================================

CREATE TABLE IF NOT EXISTS db_pools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  db_host VARCHAR(100) NOT NULL DEFAULT 'srv1412.hstgr.io',
  db_port INT NOT NULL DEFAULT 3306,
  db_name VARCHAR(100) NOT NULL UNIQUE,
  db_user VARCHAR(100) NOT NULL,
  db_password VARCHAR(255) NOT NULL,
  status ENUM('AVAILABLE', 'IN_USE', 'MAINTENANCE') NOT NULL DEFAULT 'AVAILABLE',
  assigned_tenant_id VARCHAR(50) NULL,
  assigned_at DATETIME NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_assigned_tenant (assigned_tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
  COMMENT='Pool database kosong Hostinger untuk Instant Onboarding SaaS';
