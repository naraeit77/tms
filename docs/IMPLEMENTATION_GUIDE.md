# 🚀 TMS v2.0 구현 가이드

이 문서는 TMS v2.0의 단계별 구현 가이드입니다.

## ✅ Phase 1: 프로젝트 기반 구축 (완료)

### 완료된 작업

1. **데이터베이스 스키마 설계 및 마이그레이션**
   - ✅ `0001_create_core_tables.sql`: 핵심 테이블 (Oracle 연결, 사용자, 역할, 시스템 설정)
   - ✅ `0002_create_sql_monitoring_tables.sql`: SQL 모니터링 테이블
   - ✅ `0003_create_tuning_tables.sql`: 튜닝 관리 테이블

2. **TypeScript 타입 정의**
   - ✅ `src/lib/supabase/types.ts`: 완전한 데이터베이스 타입 정의
   - ✅ Supabase 클라이언트 타입 안정성 강화

3. **환경 변수 설정**
   - ✅ `.env.example`: 전체 환경 변수 템플릿
   - ✅ Supabase, NextAuth, Oracle DB 설정 포함

### 다음 단계

마이그레이션을 Supabase에 적용하세요:

```bash
# Supabase CLI 사용
npx supabase db push

# 또는 Supabase Dashboard SQL Editor에서 수동 실행
```

---

## 🔐 Phase 2: 인증 시스템 구현 (진행 중)

### 구현할 항목

#### 2.1 NextAuth 고급 설정

**파일**: `src/lib/auth.ts`

```typescript
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { createClient } from "@/lib/supabase/server";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const supabase = await createClient();

        // Supabase 인증
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

        if (error || !data.user) {
          return null;
        }

        // 사용자 프로필 조회
        const { data: profile } = await supabase
          .from('user_profiles')
          .select(`
            *,
            user_roles (
              name,
              display_name,
              permissions
            )
          `)
          .eq('id', data.user.id)
          .single();

        return {
          id: data.user.id,
          email: data.user.email!,
          name: profile?.full_name || data.user.email,
          role: profile?.user_roles?.name || 'viewer',
          permissions: profile?.user_roles?.permissions || {},
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.permissions = user.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.permissions = token.permissions as any;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// 타입 확장
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string;
      role: string;
      permissions: any;
    };
  }

  interface User {
    role?: string;
    permissions?: any;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    permissions: any;
  }
}
```

#### 2.2 권한 검사 유틸리티

**파일**: `src/lib/permissions.ts`

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export type Resource = 'sql_monitoring' | 'tuning' | 'settings' | 'users';
export type Action = 'read' | 'write' | 'delete' | 'approve';

export async function checkPermission(
  resource: Resource,
  action: Action
): Promise<boolean> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return false;
  }

  const permissions = session.user.permissions as Record<string, string[]>;

  return permissions[resource]?.includes(action) || false;
}

export async function requirePermission(
  resource: Resource,
  action: Action
) {
  const hasPermission = await checkPermission(resource, action);

  if (!hasPermission) {
    throw new Error(`권한이 없습니다: ${resource}.${action}`);
  }
}

export function createPermissionChecker(session: any) {
  return (resource: Resource, action: Action): boolean => {
    if (!session?.user) {
      return false;
    }

    const permissions = session.user.permissions as Record<string, string[]>;
    return permissions[resource]?.includes(action) || false;
  };
}
```

#### 2.3 로그인 페이지

**파일**: `src/app/auth/signin/page.tsx`

```typescript
'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <span className="text-4xl">🗄️</span>
          </div>
          <CardTitle className="text-2xl text-center">TMS v2.0</CardTitle>
          <CardDescription className="text-center">
            Oracle 튜닝관리시스템
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="text-sm text-red-500 text-center">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? '로그인 중...' : '로그인'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 🔌 Phase 3: Oracle DB 연결 관리

### 구현할 항목

#### 3.1 Oracle Client 라이브러리 추가

```bash
npm install oracledb
```

#### 3.2 Oracle Connection Pool 관리

**파일**: `src/lib/oracle/connection-pool.ts`

```typescript
import oracledb from 'oracledb';
import { createClient } from '@/lib/supabase/server';
import type { OracleConnection } from '@/lib/supabase/types';

// Connection pool cache
const pools = new Map<string, oracledb.Pool>();

export async function getConnectionPool(connectionId: string): Promise<oracledb.Pool> {
  // Check cache
  if (pools.has(connectionId)) {
    return pools.get(connectionId)!;
  }

  // Get connection details from Supabase
  const supabase = await createClient();
  const { data: connection, error } = await supabase
    .from('oracle_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('is_active', true)
    .single();

  if (error || !connection) {
    throw new Error(`Oracle connection not found: ${connectionId}`);
  }

  // Decrypt password
  const password = await decryptPassword(connection.password_encrypted);

  // Create connection pool
  const connectString = connection.connection_type === 'SERVICE_NAME'
    ? `${connection.host}:${connection.port}/${connection.service_name}`
    : `${connection.host}:${connection.port}:${connection.sid}`;

  const pool = await oracledb.createPool({
    user: connection.username,
    password,
    connectString,
    poolMin: 2,
    poolMax: connection.max_connections,
    poolIncrement: 2,
    poolTimeout: connection.connection_timeout / 1000,
  });

  // Cache pool
  pools.set(connectionId, pool);

  // Update last connected time
  await supabase
    .from('oracle_connections')
    .update({
      last_connected_at: new Date().toISOString(),
      health_status: 'HEALTHY',
    })
    .eq('id', connectionId);

  return pool;
}

export async function executeQuery<T = any>(
  connectionId: string,
  sql: string,
  binds: any[] = [],
  options: oracledb.ExecuteOptions = {}
): Promise<T> {
  const pool = await getConnectionPool(connectionId);
  const connection = await pool.getConnection();

  try {
    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options,
    });

    return result.rows as T;
  } finally {
    await connection.close();
  }
}

async function decryptPassword(encrypted: string): Promise<string> {
  // TODO: Implement AES-256 decryption
  // For now, return as-is (implement proper encryption later)
  return encrypted;
}

export async function closeAllPools() {
  for (const [id, pool] of pools.entries()) {
    await pool.close();
    pools.delete(id);
  }
}
```

---

## 📊 Phase 4: SQL 모니터링 기능

### 구현할 항목

#### 4.1 SQL Statistics 수집 스케줄러

**파일**: `src/lib/oracle/sql-collector.ts`

```typescript
import { executeQuery } from './connection-pool';
import { createClient } from '@/lib/supabase/server';

const SQL_STATS_QUERY = `
SELECT
  sql_id,
  plan_hash_value,
  module,
  parsing_schema_name as schema_name,
  elapsed_time / 1000 as elapsed_time_ms,
  cpu_time / 1000 as cpu_time_ms,
  buffer_gets,
  disk_reads,
  direct_writes,
  executions,
  parse_calls,
  rows_processed,
  application_wait_time / 1000 as application_wait_time_ms,
  concurrency_wait_time / 1000 as concurrency_wait_time_ms,
  cluster_wait_time / 1000 as cluster_wait_time_ms,
  user_io_wait_time / 1000 as user_io_wait_time_ms,
  first_load_time,
  last_active_time,
  last_load_time
FROM v$sql
WHERE executions > 0
  AND parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP')
ORDER BY buffer_gets DESC
FETCH FIRST 1000 ROWS ONLY
`;

export async function collectSQLStatistics(connectionId: string) {
  try {
    // Execute query on Oracle
    const rows = await executeQuery<any[]>(
      connectionId,
      SQL_STATS_QUERY
    );

    if (!rows || rows.length === 0) {
      return { collected: 0, errors: 0 };
    }

    const supabase = await createClient();
    let collected = 0;
    let errors = 0;

    // Get system settings for thresholds
    const { data: settings } = await supabase
      .from('system_settings')
      .select('*')
      .in('key', ['elapsed_time_critical', 'elapsed_time_warning', 'buffer_gets_critical', 'buffer_gets_warning']);

    const thresholds = {
      elapsed_critical: settings?.find(s => s.key === 'elapsed_time_critical')?.value?.value || 10000,
      elapsed_warning: settings?.find(s => s.key === 'elapsed_time_warning')?.value?.value || 5000,
      buffer_critical: settings?.find(s => s.key === 'buffer_gets_critical')?.value?.value || 1000000,
      buffer_warning: settings?.find(s => s.key === 'buffer_gets_warning')?.value?.value || 500000,
    };

    // Insert or update SQL statistics
    for (const row of rows) {
      try {
        // Get SQL text
        const sqlTextResult = await executeQuery<any[]>(
          connectionId,
          `SELECT sql_fulltext FROM v$sql WHERE sql_id = :sql_id AND ROWNUM = 1`,
          [row.SQL_ID]
        );

        const sqlText = sqlTextResult[0]?.SQL_FULLTEXT || '';

        // Calculate status
        const status = determineStatus(row, thresholds);
        const priority = determinePriority(row, thresholds);

        // Upsert to Supabase
        const { error } = await supabase
          .from('sql_statistics')
          .upsert({
            oracle_connection_id: connectionId,
            sql_id: row.SQL_ID,
            plan_hash_value: row.PLAN_HASH_VALUE,
            module: row.MODULE,
            schema_name: row.SCHEMA_NAME,
            sql_text: sqlText.substring(0, 4000),
            sql_fulltext: sqlText,
            elapsed_time_ms: row.ELAPSED_TIME_MS,
            cpu_time_ms: row.CPU_TIME_MS,
            buffer_gets: row.BUFFER_GETS,
            disk_reads: row.DISK_READS,
            direct_writes: row.DIRECT_WRITES,
            executions: row.EXECUTIONS,
            parse_calls: row.PARSE_CALLS,
            rows_processed: row.ROWS_PROCESSED,
            avg_elapsed_time_ms: row.EXECUTIONS > 0 ? row.ELAPSED_TIME_MS / row.EXECUTIONS : 0,
            avg_cpu_time_ms: row.EXECUTIONS > 0 ? row.CPU_TIME_MS / row.EXECUTIONS : 0,
            gets_per_exec: row.EXECUTIONS > 0 ? row.BUFFER_GETS / row.EXECUTIONS : 0,
            rows_per_exec: row.EXECUTIONS > 0 ? row.ROWS_PROCESSED / row.EXECUTIONS : 0,
            application_wait_time_ms: row.APPLICATION_WAIT_TIME_MS,
            concurrency_wait_time_ms: row.CONCURRENCY_WAIT_TIME_MS,
            cluster_wait_time_ms: row.CLUSTER_WAIT_TIME_MS,
            user_io_wait_time_ms: row.USER_IO_WAIT_TIME_MS,
            first_load_time: row.FIRST_LOAD_TIME,
            last_active_time: row.LAST_ACTIVE_TIME,
            last_load_time: row.LAST_LOAD_TIME,
            collected_at: new Date().toISOString(),
            status,
            priority,
          }, {
            onConflict: 'oracle_connection_id,sql_id',
          });

        if (error) {
          errors++;
          console.error(`Error upserting SQL ${row.SQL_ID}:`, error);
        } else {
          collected++;
        }
      } catch (err) {
        errors++;
        console.error(`Error processing SQL ${row.SQL_ID}:`, err);
      }
    }

    return { collected, errors, total: rows.length };
  } catch (error) {
    console.error('Error collecting SQL statistics:', error);
    throw error;
  }
}

function determineStatus(row: any, thresholds: any): 'NORMAL' | 'WARNING' | 'CRITICAL' {
  if (row.ELAPSED_TIME_MS >= thresholds.elapsed_critical ||
      row.BUFFER_GETS >= thresholds.buffer_critical) {
    return 'CRITICAL';
  }

  if (row.ELAPSED_TIME_MS >= thresholds.elapsed_warning ||
      row.BUFFER_GETS >= thresholds.buffer_warning) {
    return 'WARNING';
  }

  return 'NORMAL';
}

function determinePriority(row: any, thresholds: any): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const status = determineStatus(row, thresholds);

  if (status === 'CRITICAL') {
    return 'CRITICAL';
  } else if (status === 'WARNING') {
    return 'HIGH';
  } else {
    return 'MEDIUM';
  }
}
```

---

## 다음 단계

1. **Phase 2 완료**: 인증 시스템 구현
2. **Phase 3 구현**: Oracle DB 연결 관리 API 및 UI
3. **Phase 4 구현**: SQL 모니터링 대시보드 및 자동 수집
4. **Phase 5 구현**: 튜닝 워크플로우 UI 및 프로세스
5. **Phase 6 구현**: 전체 대시보드 및 주요 화면

각 Phase를 순차적으로 구현하면서 테스트를 진행하세요.
