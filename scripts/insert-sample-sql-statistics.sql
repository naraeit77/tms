-- Insert sample SQL statistics data for testing
-- This script creates realistic SQL monitoring data in the sql_statistics table

-- First, get the first oracle_connection_id (you'll need to replace this with an actual connection ID)
-- You can find connection IDs by running: SELECT id, name FROM oracle_connections;

-- Example: Replace 'YOUR_CONNECTION_ID' with an actual UUID from your oracle_connections table
-- For now, we'll use a placeholder variable

DO $$
DECLARE
  conn_id UUID;
  base_time TIMESTAMPTZ := NOW() - INTERVAL '7 days';
  i INTEGER;
BEGIN
  -- Get the first active connection (you can modify this to use a specific connection)
  SELECT id INTO conn_id FROM oracle_connections WHERE is_active = true LIMIT 1;

  IF conn_id IS NULL THEN
    RAISE NOTICE 'No active Oracle connection found. Please create a connection first.';
    RETURN;
  END IF;

  RAISE NOTICE 'Using connection ID: %', conn_id;

  -- Insert Grade A SQL statements (excellent performance)
  FOR i IN 1..215 LOOP
    INSERT INTO sql_statistics (
      oracle_connection_id,
      sql_id,
      plan_hash_value,
      module,
      schema_name,
      sql_text,
      elapsed_time_ms,
      cpu_time_ms,
      buffer_gets,
      disk_reads,
      executions,
      avg_elapsed_time_ms,
      avg_cpu_time_ms,
      gets_per_exec,
      rows_per_exec,
      rows_processed,
      collected_at,
      status,
      priority
    ) VALUES (
      conn_id,
      'SQL_A' || LPAD(i::TEXT, 6, '0'),
      1000000 + i,
      'WEBAPP',
      'APPUSER',
      'SELECT * FROM users WHERE id = :1',
      RANDOM() * 50 + 1, -- 1-51ms elapsed time
      RANDOM() * 20 + 1, -- 1-21ms CPU time
      (RANDOM() * 80 + 10)::BIGINT, -- 10-90 buffer gets
      (RANDOM() * 5)::BIGINT, -- 0-5 disk reads
      (RANDOM() * 1000 + 100)::INTEGER, -- 100-1100 executions
      RANDOM() * 5 + 1, -- avg elapsed
      RANDOM() * 2 + 1, -- avg CPU
      RANDOM() * 80 + 10, -- gets per exec
      RANDOM() * 10 + 1, -- rows per exec
      (RANDOM() * 10000 + 100)::BIGINT,
      base_time + (RANDOM() * INTERVAL '7 days'),
      'NORMAL',
      'LOW'
    );
  END LOOP;

  -- Insert Grade B SQL statements (good performance)
  FOR i IN 1..417 LOOP
    INSERT INTO sql_statistics (
      oracle_connection_id,
      sql_id,
      plan_hash_value,
      module,
      schema_name,
      sql_text,
      elapsed_time_ms,
      cpu_time_ms,
      buffer_gets,
      disk_reads,
      executions,
      avg_elapsed_time_ms,
      avg_cpu_time_ms,
      gets_per_exec,
      rows_per_exec,
      rows_processed,
      collected_at,
      status,
      priority
    ) VALUES (
      conn_id,
      'SQL_B' || LPAD(i::TEXT, 6, '0'),
      2000000 + i,
      'BATCH',
      'APPUSER',
      'SELECT a.*, b.name FROM orders a JOIN customers b ON a.customer_id = b.id WHERE a.status = :1',
      RANDOM() * 80 + 20, -- 20-100ms elapsed time
      RANDOM() * 40 + 10, -- 10-50ms CPU time
      (RANDOM() * 700 + 100)::BIGINT, -- 100-800 buffer gets
      (RANDOM() * 20 + 5)::BIGINT, -- 5-25 disk reads
      (RANDOM() * 500 + 50)::INTEGER, -- 50-550 executions
      RANDOM() * 30 + 10, -- avg elapsed
      RANDOM() * 15 + 5, -- avg CPU
      RANDOM() * 700 + 100, -- gets per exec
      RANDOM() * 50 + 10, -- rows per exec
      (RANDOM() * 25000 + 500)::BIGINT,
      base_time + (RANDOM() * INTERVAL '7 days'),
      'NORMAL',
      'MEDIUM'
    );
  END LOOP;

  -- Insert Grade C SQL statements (average performance)
  FOR i IN 1..255 LOOP
    INSERT INTO sql_statistics (
      oracle_connection_id,
      sql_id,
      plan_hash_value,
      module,
      schema_name,
      sql_text,
      elapsed_time_ms,
      cpu_time_ms,
      buffer_gets,
      disk_reads,
      executions,
      avg_elapsed_time_ms,
      avg_cpu_time_ms,
      gets_per_exec,
      rows_per_exec,
      rows_processed,
      collected_at,
      status,
      priority
    ) VALUES (
      conn_id,
      'SQL_C' || LPAD(i::TEXT, 6, '0'),
      3000000 + i,
      'REPORT',
      'APPUSER',
      'SELECT COUNT(*), AVG(amount) FROM transactions WHERE created_at >= :1 GROUP BY customer_id',
      RANDOM() * 400 + 100, -- 100-500ms elapsed time
      RANDOM() * 200 + 50, -- 50-250ms CPU time
      (RANDOM() * 5000 + 1000)::BIGINT, -- 1000-6000 buffer gets
      (RANDOM() * 100 + 20)::BIGINT, -- 20-120 disk reads
      (RANDOM() * 200 + 20)::INTEGER, -- 20-220 executions
      RANDOM() * 200 + 50, -- avg elapsed
      RANDOM() * 100 + 25, -- avg CPU
      RANDOM() * 5000 + 1000, -- gets per exec
      RANDOM() * 100 + 50, -- rows per exec
      (RANDOM() * 50000 + 1000)::BIGINT,
      base_time + (RANDOM() * INTERVAL '7 days'),
      'WARNING',
      'MEDIUM'
    );
  END LOOP;

  -- Insert Grade D SQL statements (poor performance)
  FOR i IN 1..287 LOOP
    INSERT INTO sql_statistics (
      oracle_connection_id,
      sql_id,
      plan_hash_value,
      module,
      schema_name,
      sql_text,
      elapsed_time_ms,
      cpu_time_ms,
      buffer_gets,
      disk_reads,
      executions,
      avg_elapsed_time_ms,
      avg_cpu_time_ms,
      gets_per_exec,
      rows_per_exec,
      rows_processed,
      collected_at,
      status,
      priority
    ) VALUES (
      conn_id,
      'SQL_D' || LPAD(i::TEXT, 6, '0'),
      4000000 + i,
      'ANALYTICS',
      'APPUSER',
      'SELECT * FROM large_table WHERE unindexed_column LIKE ''%value%''',
      RANDOM() * 3000 + 500, -- 500-3500ms elapsed time
      RANDOM() * 1500 + 250, -- 250-1750ms CPU time
      (RANDOM() * 50000 + 10000)::BIGINT, -- 10000-60000 buffer gets
      (RANDOM() * 500 + 100)::BIGINT, -- 100-600 disk reads
      (RANDOM() * 100 + 10)::INTEGER, -- 10-110 executions
      RANDOM() * 1500 + 500, -- avg elapsed
      RANDOM() * 750 + 250, -- avg CPU
      RANDOM() * 50000 + 10000, -- gets per exec
      RANDOM() * 500 + 100, -- rows per exec
      (RANDOM() * 100000 + 5000)::BIGINT,
      base_time + (RANDOM() * INTERVAL '7 days'),
      'WARNING',
      'HIGH'
    );
  END LOOP;

  -- Insert Grade F SQL statements (critical performance issues)
  FOR i IN 1..142 LOOP
    INSERT INTO sql_statistics (
      oracle_connection_id,
      sql_id,
      plan_hash_value,
      module,
      schema_name,
      sql_text,
      elapsed_time_ms,
      cpu_time_ms,
      buffer_gets,
      disk_reads,
      executions,
      avg_elapsed_time_ms,
      avg_cpu_time_ms,
      gets_per_exec,
      rows_per_exec,
      rows_processed,
      collected_at,
      status,
      priority
    ) VALUES (
      conn_id,
      'SQL_F' || LPAD(i::TEXT, 6, '0'),
      5000000 + i,
      'BACKGROUND',
      'APPUSER',
      'SELECT a.*, b.*, c.* FROM table1 a, table2 b, table3 c WHERE a.id = b.id AND b.id = c.id',
      RANDOM() * 20000 + 5000, -- 5000-25000ms elapsed time
      RANDOM() * 10000 + 2500, -- 2500-12500ms CPU time
      (RANDOM() * 500000 + 100000)::BIGINT, -- 100000-600000 buffer gets
      (RANDOM() * 5000 + 1000)::BIGINT, -- 1000-6000 disk reads
      (RANDOM() * 50 + 5)::INTEGER, -- 5-55 executions
      RANDOM() * 10000 + 5000, -- avg elapsed
      RANDOM() * 5000 + 2500, -- avg CPU
      RANDOM() * 500000 + 100000, -- gets per exec
      RANDOM() * 1000 + 500, -- rows per exec
      (RANDOM() * 500000 + 10000)::BIGINT,
      base_time + (RANDOM() * INTERVAL '7 days'),
      'CRITICAL',
      'CRITICAL'
    );
  END LOOP;

  RAISE NOTICE 'Successfully inserted sample SQL statistics data';
  RAISE NOTICE 'Grade A: 215, Grade B: 417, Grade C: 255, Grade D: 287, Grade F: 142';
  RAISE NOTICE 'Total SQL statements: 1316';
END $$;
