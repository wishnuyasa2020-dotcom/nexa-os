-- =======================================================
-- Migration: Modul Sekolah — Fase 1 Ontologi Nexa OS
-- Generated: 2026-09-10
-- Deskripsi:
--   1. Tambah kolom `intent` di sekolah_periode
--   2. Pastikan indeks relevan ada
-- =======================================================

-- Step 1: Tambah kolom `intent` ke sekolah_periode
ALTER TABLE sekolah_periode
  ADD COLUMN intent ENUM('High', 'Mid', 'Low') NULL DEFAULT NULL
    COMMENT 'Intent level sekolah: High/Mid/Low — diset manual oleh CRO/Manager'
  AFTER alasan_tidak_bisa_sosialisasi;

-- Step 2: Indeks untuk query filter intent
-- (Opsional, tergantung volume data)
-- CREATE INDEX idx_sp_intent ON sekolah_periode (intent);

-- Step 3: Verifikasi kolom
DESCRIBE sekolah_periode;

-- Selesai!
-- Catatan: Tidak ada perubahan destructive. Kolom baru nullable, nilai default NULL.
