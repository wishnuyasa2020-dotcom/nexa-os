-- ============================================================
-- Migration: Create student_current_state (Read-Model Projection)
-- Tujuan: Menggantikan JOIN berat ke siswa_periode untuk filter
--         Silo Inbox CRO pada Modul Live Chat.
-- ============================================================

CREATE TABLE IF NOT EXISTS student_current_state (
  id_siswa        VARCHAR(50)  NOT NULL,
  nama_siswa      VARCHAR(150) NULL,
  cro_assignee    VARCHAR(100) NULL COMMENT 'Nama CRO yang handle siswa ini',
  pipeline_state  VARCHAR(50)  NULL COMMENT 'commercial_state terkini: Lead/Prospect/Opportunity/Customer',
  status_label    VARCHAR(50)  NULL COMMENT 'status_terkini legacy',
  marketing_period VARCHAR(20) NULL,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_siswa),
  INDEX idx_cro_assignee (cro_assignee),
  INDEX idx_pipeline_state (pipeline_state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Read-Model Projection snapshot status siswa per CRO';

-- Populate awal dari siswa_periode
INSERT INTO student_current_state (id_siswa, nama_siswa, cro_assignee, pipeline_state, status_label, marketing_period, updated_at)
SELECT
  sp.id_siswa,
  ms.nama_lengkap,
  sp.cro                AS cro_assignee,
  sp.commercial_state   AS pipeline_state,
  sp.status_terkini     AS status_label,
  sp.marketing_period,
  COALESCE(sp.last_updated, NOW())
FROM siswa_periode sp
JOIN master_siswa ms ON ms.id_siswa = sp.id_siswa
WHERE sp.id_record = (
  SELECT id_record FROM siswa_periode sp2
  WHERE sp2.id_siswa = sp.id_siswa
  ORDER BY sp2.last_updated DESC, sp2.created_date DESC
  LIMIT 1
)
ON DUPLICATE KEY UPDATE
  cro_assignee    = VALUES(cro_assignee),
  pipeline_state  = VALUES(pipeline_state),
  status_label    = VALUES(status_label),
  marketing_period= VALUES(marketing_period),
  updated_at      = VALUES(updated_at);
