-- Migration: Tambah kolom Event-Sourcing ke tabel siswa (Fase 1)
-- Tanggal: 2026-09-10
-- Jalankan di database tenant (crmdemo): u294320793_crmdemo
-- SAFE: Hanya ADD COLUMN, tidak menghapus tabel lama.

ALTER TABLE siswa_periode 
  ADD COLUMN IF NOT EXISTS commercial_state VARCHAR(50) NULL DEFAULT 'Lead',
  ADD COLUMN IF NOT EXISTS intent ENUM('High','Mid','Low') NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS priority_score INT NOT NULL DEFAULT 0;

ALTER TABLE aktivitas_siswa
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(60) NULL DEFAULT 'InteractionLogged',
  ADD COLUMN IF NOT EXISTS channel VARCHAR(50) NULL DEFAULT 'WhatsApp';

-- Backfill: mapping status lama → commercial_state baru
UPDATE siswa_periode SET commercial_state = CASE status_terkini
  WHEN 'Data Masuk'       THEN 'Known'
  WHEN 'Calon Prospek'    THEN 'Lead'
  WHEN 'Prospek Aktif'    THEN 'Prospect'
  WHEN 'Konsultasi'       THEN 'Opportunity'
  WHEN 'Layak Home Visit' THEN 'Opportunity'
  WHEN 'Home Visit'       THEN 'Opportunity'
  WHEN 'Siap Daftar'      THEN 'Opportunity'
  WHEN 'Terdaftar'        THEN 'Customer'
  WHEN 'Tidak Lanjut'     THEN 'Disqualified'
  ELSE 'Lead'
END
WHERE commercial_state IS NULL OR commercial_state = 'Lead';
