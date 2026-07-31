import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  inet,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// 자체 인증 테이블 (bcrypt + NextAuth)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 50 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  description: text('description'),
  permissions: jsonb('permissions').default({}),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').references(() => userRoles.id),
  fullName: varchar('full_name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  department: varchar('department', { length: 100 }),
  phone: varchar('phone', { length: 20 }),
  avatarUrl: text('avatar_url'),
  preferences: jsonb('preferences').default({}),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true),
  // 사용기한. NULL = 무제한. <= now() 이면 로그인 차단.
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_user_profiles_email').on(table.email),
  index('idx_user_profiles_role').on(table.roleId),
  index('idx_user_profiles_expires_at').on(table.expiresAt),
]);

// 사용자 로그인(접속) 이력 — 접속 아이디별 접속일자·월접속 횟수 집계용.
// 사용자 삭제 시에도 이력을 보존하도록 userId 는 SET NULL, email 은 비정규화 저장.
export const loginHistory = pgTable('login_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  email: varchar('email', { length: 255 }).notNull(),
  success: boolean('success').default(true).notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  loginAt: timestamp('login_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_login_history_user').on(table.userId),
  index('idx_login_history_email').on(table.email),
  index('idx_login_history_login_at').on(table.loginAt),
]);

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  autoTuningEnabled: boolean('auto_tuning_enabled').default(false),
  performanceThresholdMs: integer('performance_threshold_ms').default(1000),
  bufferGetsThreshold: integer('buffer_gets_threshold').default(10000),
  cpuTimeThresholdMs: integer('cpu_time_threshold_ms').default(5000),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_user_settings_user').on(table.userId),
]);
