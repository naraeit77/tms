import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  inet,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const reportTemplates = pgTable('report_templates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull().unique(),
  description: text('description'),
  type: varchar('type', { length: 50 }).notNull(),
  sections: text('sections').array().default(sql`'{}'`),
  defaultConfig: jsonb('default_config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  templateId: varchar('template_id', { length: 100 }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  type: varchar('type', { length: 50 }).notNull(),
  config: jsonb('config').notNull().default({}),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  filePath: text('file_path'),
  fileSize: bigint('file_size', { mode: 'number' }),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  tags: text('tags').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_reports_user_id').on(table.userId),
  index('idx_reports_type').on(table.type),
  index('idx_reports_status').on(table.status),
  index('idx_reports_created_at').on(table.createdAt),
]);

export const reportSchedules = pgTable('report_schedules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid('report_id').notNull().references(() => reports.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  frequency: varchar('frequency', { length: 50 }).notNull(),
  dayOfWeek: integer('day_of_week'),
  dayOfMonth: integer('day_of_month'),
  time: varchar('time', { length: 10 }).notNull(),
  timezone: varchar('timezone', { length: 100 }).notNull().default('Asia/Seoul'),
  isActive: boolean('is_active').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_report_schedules_user_id').on(table.userId),
  index('idx_report_schedules_next_run_at').on(table.nextRunAt),
]);

export const reportActivities = pgTable('report_activities', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  reportId: uuid('report_id').notNull().references(() => reports.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 50 }).notNull(),
  details: jsonb('details').default({}),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_report_activities_report_id').on(table.reportId),
  index('idx_report_activities_user_id').on(table.userId),
  index('idx_report_activities_created_at').on(table.createdAt),
]);
