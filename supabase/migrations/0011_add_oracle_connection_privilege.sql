-- =====================================================
-- TMS v2.0 Migration: Add privilege column to oracle_connections
-- Description: SYS/SYSDBA/SYSOPER 접속 권한 지원
-- =====================================================

-- Add privilege column for SYSDBA/SYSOPER connections
ALTER TABLE oracle_connections
ADD COLUMN IF NOT EXISTS privilege VARCHAR(20) CHECK (privilege IN ('SYSDBA', 'SYSOPER'));

-- Add oracle_edition column if not exists
ALTER TABLE oracle_connections
ADD COLUMN IF NOT EXISTS oracle_edition VARCHAR(50);

COMMENT ON COLUMN oracle_connections.privilege IS 'Oracle connection privilege: SYSDBA or SYSOPER (NULL for normal connections)';
