-- ============================================================
-- NexaMOS: Credit Billing System — Migration
-- Tanggal  : 2026-09-16
-- Target DB: Setiap database TENANT yang aktif
--            (contoh: u294320793_crmdemo, u294320793_nexacrm, dll)
-- Cara run : Jalankan via phpMyAdmin / MySQL CLI di setiap tenant DB
-- ============================================================

-- 1. Saldo Kredit per Tenant
-- Blokir outbound template jika saldo <= threshold (default Rp 350.000)
CREATE TABLE IF NOT EXISTS tenant_credits (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id     VARCHAR(50)   NOT NULL UNIQUE,
  balance       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  threshold     DECIMAL(12,2) NOT NULL DEFAULT 350000.00,
  is_blocked    TINYINT(1)    NOT NULL DEFAULT 0,
  last_topup_at DATETIME      NULL,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_balance CHECK (balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Log Transaksi Kredit (deduct per pesan / topup / refund)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id       VARCHAR(50)   NOT NULL,
  type            ENUM('topup','deduction','refund','adjustment') NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  balance_before  DECIMAL(12,2) NOT NULL,
  balance_after   DECIMAL(12,2) NOT NULL,
  message_type    ENUM('marketing','utility','authentication','service') NULL,
  wa_message_id   VARCHAR(100)  NULL,
  phone_number    VARCHAR(20)   NULL,
  reference       VARCHAR(100)  NULL,
  note            TEXT          NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tenant_created  (tenant_id, created_at),
  INDEX idx_wa_message      (wa_message_id),
  INDEX idx_type            (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Antrian Top-Up Manual (Fase Beta: Transfer → Admin Konfirmasi)
CREATE TABLE IF NOT EXISTS credit_topup_requests (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id       VARCHAR(50)   NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  transfer_ref    VARCHAR(100)  NULL,
  transfer_proof  VARCHAR(500)  NULL,
  status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  requested_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at    DATETIME      NULL,
  processed_by    VARCHAR(100)  NULL,
  note            TEXT          NULL,
  INDEX idx_status  (status),
  INDEX idx_tenant  (tenant_id),
  INDEX idx_date    (requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Seed: Baris awal untuk tenant aktif
-- Ubah nilai tenant_id sesuai tenant_id di nexamain.tenants
-- ============================================================
INSERT IGNORE INTO tenant_credits (tenant_id, balance, threshold, is_blocked)
VALUES ('derma-indonesia', 0.00, 350000.00, 0);

-- ============================================================
-- Verifikasi
-- ============================================================
SHOW TABLES LIKE 'tenant_credits';
SHOW TABLES LIKE 'credit_transactions';
SHOW TABLES LIKE 'credit_topup_requests';
SELECT * FROM tenant_credits;
