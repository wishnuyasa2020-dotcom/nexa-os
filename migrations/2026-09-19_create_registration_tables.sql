-- Migration: Create registration_tokens, payment_settings, and pendaftaran_siswa tables
-- Ensures all multi-tenant databases have required tables for Online Registration & Live Chat

CREATE TABLE IF NOT EXISTS `registration_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `token` varchar(64) NOT NULL,
  `id_siswa` varchar(50) NOT NULL,
  `nama_lengkap` varchar(200) NOT NULL,
  `no_wa` varchar(20) NOT NULL,
  `status` enum('pending','paid','expired') DEFAULT 'pending',
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `idx_token` (`token`),
  KEY `idx_siswa` (`id_siswa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payment_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bank_name` varchar(50) NOT NULL DEFAULT 'BCA',
  `bank_account_number` varchar(50) NOT NULL DEFAULT '',
  `bank_account_holder` varchar(100) NOT NULL DEFAULT '',
  `bank_notes` text DEFAULT NULL,
  `registration_fee` decimal(12,2) NOT NULL DEFAULT 500000.00,
  `core_deposit_amount` decimal(12,2) NOT NULL DEFAULT 1500000.00,
  `total_program_fee` decimal(12,2) NOT NULL DEFAULT 15000000.00,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `discount_label` varchar(100) DEFAULT NULL,
  `discount_end_date` date DEFAULT NULL,
  `program_names` text DEFAULT NULL,
  `qris_image_url` varchar(255) DEFAULT NULL,
  `updated_by` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pendaftaran_siswa` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_siswa` varchar(50) NOT NULL,
  `nik` varchar(20) DEFAULT NULL,
  `gender` enum('Laki-laki','Perempuan') DEFAULT NULL,
  `tanggal_lahir` date DEFAULT NULL,
  `alamat_lengkap` text DEFAULT NULL,
  `nama_program` varchar(150) DEFAULT NULL,
  `nama_ortu` varchar(150) DEFAULT NULL,
  `wa_ortu` varchar(25) DEFAULT NULL,
  `tgl_lahir_ortu` date DEFAULT NULL,
  `pekerjaan_ortu` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_siswa` (`id_siswa`),
  KEY `idx_siswa` (`id_siswa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
