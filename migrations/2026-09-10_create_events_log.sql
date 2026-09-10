-- Migration: Buat tabel events_log untuk arsitektur Event-Sourcing (Fase 1)
-- Tanggal: 2026-09-10
-- Diterapkan ke semua database tenant (crmdemo, crmderma, dll)

CREATE TABLE IF NOT EXISTS `events_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `event_id` VARCHAR(64) NOT NULL,
  `aggregate_type` VARCHAR(50) NOT NULL DEFAULT 'general',
  `aggregate_id` VARCHAR(100) NOT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `payload` JSON NULL,
  `actor_id` VARCHAR(100) NULL DEFAULT 'System',
  `marketing_period` VARCHAR(50) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_event_id` (`event_id`),
  INDEX `idx_aggregate` (`aggregate_type`, `aggregate_id`),
  INDEX `idx_event_type` (`event_type`),
  INDEX `idx_actor_id` (`actor_id`),
  INDEX `idx_marketing_period` (`marketing_period`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
