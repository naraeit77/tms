import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  numeric,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { oracleConnections } from './connections';

export const awrReports = pgTable('awr_reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => oracleConnections.id, { onDelete: 'cascade' }),
  reportType: varchar('report_type', { length: 10 }).notNull(),
  beginSnapId: integer('begin_snap_id').notNull(),
  endSnapId: integer('end_snap_id').notNull(),
  reportName: varchar('report_name', { length: 500 }).notNull(),
  fileSize: integer('file_size'),
  status: varchar('status', { length: 20 }).notNull().default('COMPLETED'),
  errorMessage: text('error_message'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_awr_reports_user_id').on(table.userId),
  index('idx_awr_reports_connection_id').on(table.connectionId),
  index('idx_awr_reports_generated_at').on(table.generatedAt),
  index('idx_awr_reports_status').on(table.status),
  index('idx_awr_reports_snapshots').on(table.beginSnapId, table.endSnapId),
]);

export const statspackSnapshots = pgTable('statspack_snapshots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  oracleConnectionId: uuid('oracle_connection_id').notNull().references(() => oracleConnections.id, { onDelete: 'cascade' }),
  snapId: integer('snap_id').notNull(),
  snapTime: timestamp('snap_time').notNull(),
  startupTime: timestamp('startup_time').notNull(),
  sessionCount: integer('session_count').default(0),
  transactionCount: integer('transaction_count').default(0),
  dbTimeMs: bigint('db_time_ms', { mode: 'number' }).default(0),
  cpuTimeMs: bigint('cpu_time_ms', { mode: 'number' }).default(0),
  physicalReads: bigint('physical_reads', { mode: 'number' }).default(0),
  logicalReads: bigint('logical_reads', { mode: 'number' }).default(0),
  redoSizeMb: numeric('redo_size_mb', { precision: 12, scale: 2 }).default('0'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  unique('uq_statspack_snapshots').on(table.oracleConnectionId, table.snapId),
  index('idx_statspack_snapshots_connection').on(table.oracleConnectionId),
  index('idx_statspack_snapshots_snap_time').on(table.snapTime),
]);

export const statspackReports = pgTable('statspack_reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  oracleConnectionId: uuid('oracle_connection_id').notNull().references(() => oracleConnections.id, { onDelete: 'cascade' }),
  beginSnapId: integer('begin_snap_id').notNull(),
  endSnapId: integer('end_snap_id').notNull(),
  reportType: varchar('report_type', { length: 10 }).notNull(),
  reportContent: text('report_content').notNull(),
  beginTime: timestamp('begin_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_statspack_reports_connection').on(table.oracleConnectionId),
  index('idx_statspack_reports_snap_range').on(table.beginSnapId, table.endSnapId),
]);

export const statsCollectionHistory = pgTable('stats_collection_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  oracleConnectionId: uuid('oracle_connection_id').notNull().references(() => oracleConnections.id, { onDelete: 'cascade' }),
  owner: varchar('owner', { length: 128 }).notNull(),
  tableName: varchar('table_name', { length: 128 }).notNull(),
  operation: varchar('operation', { length: 50 }).notNull().default('GATHER_TABLE_STATS'),
  status: varchar('status', { length: 20 }).notNull().default('IN_PROGRESS'),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_stats_history_connection').on(table.oracleConnectionId),
  index('idx_stats_history_status').on(table.status),
  index('idx_stats_history_created_at').on(table.createdAt),
  index('idx_stats_history_owner_table').on(table.owner, table.tableName),
]);
