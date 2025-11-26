# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Narae TMS v2.0** - SQL Tuning Management System by 주식회사 나래정보기술

A professional Oracle SQL tuning and performance management system built with Next.js 15, providing comprehensive performance monitoring, SQL analysis, AWR/ASH analysis, and automated tuning recommendations.

### Core Capabilities
- Real-time Oracle database monitoring and session management
- SQL performance analysis with execution plan visualization
- AWR (Automatic Workload Repository) and ASH (Active Session History) reporting
- Oracle Advisor integration (SQL Tuning, Segment, Memory, Undo)
- SQL pattern detection and refactoring suggestions
- DBMS_XPLAN integration for execution plan analysis
- Statistics collection management (DBMS_STATS, Statspack)
- SQL Plan Baseline management
- Report generation with PDF/Excel export

## Development Commands

```bash
# Development server
npm run dev

# Development server with Turbopack (faster)
npm run dev:turbo

# Production build
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Tech Stack & Architecture

### Core Framework
- **Next.js 15.1.0** with App Router (`src/app/`)
- **React 19** with Server Components and Client Components
- **TypeScript** with path alias `@/*` → `./src/*`

### State & Data Management
- **React Query** (`@tanstack/react-query`) - server state management with 60s staleTime default
- **Zustand** - global client state (see `src/lib/stores/`)
- **React Hook Form** + **Zod** - form validation and schema validation
- **Axios** - HTTP client for API calls

### Database & Backend
- **Supabase** - PostgreSQL backend for metadata storage
  - Client: `src/lib/supabase/client.ts` - browser client
  - Server: `src/lib/supabase/server.ts` - server client with cookie handling
  - Pure: `createPureClient()` - service role client for operations without user context
- **Oracle Database** (`oracledb`) - target databases for monitoring
  - Client: `src/lib/oracle/client.ts` - connection pooling and query execution
  - Types: `src/lib/oracle/types.ts` - Oracle-specific type definitions
  - Supports Thick mode (optional) via `ORACLE_THICK_MODE` env var

### Authentication
- **NextAuth v4** - JWT strategy, configured in `src/lib/auth.ts`
- Role-based permissions (admin, tuner, viewer)
- Session user includes `id`, `role`, `roleId`, `permissions`
- Auth pages: `/auth/signin`, `/auth/signout`, `/auth/error`

### UI & Styling
- **Tailwind CSS** - utility-first with custom theme (HSL color system)
- **Shadcn UI** - accessible components in `src/components/ui/`
- **Radix UI** - headless primitives for Shadcn
- **Lucide React** - icon system
- **Framer Motion** - animations
- **Recharts** - data visualization charts
- **D3.js** - advanced visualizations
- **next-themes** - dark mode support with class strategy
- **Sonner** + **Toaster** - dual notification system

### Utilities
- **date-fns** - date manipulation
- **ts-pattern** - type-safe pattern matching
- **es-toolkit** - utility functions (preferred over lodash)
- **react-use** - common React hooks
- **clsx** + **class-variance-authority** - conditional classes
- **bcryptjs** - password hashing
- **ExcelJS** - Excel file generation
- **jsPDF** + **jspdf-autotable** - PDF generation
- **html2canvas** - screenshots for reports
- **node-cron** - scheduled tasks

## Directory Structure

```
src/
├── app/
│   ├── (dashboard)/           # Dashboard route group (protected)
│   │   ├── analysis/          # SQL analysis features
│   │   ├── advisor/           # Oracle advisors (SQL Tuning, Segment, etc.)
│   │   ├── awr/               # AWR reports
│   │   ├── ash/               # ASH analysis
│   │   ├── connections/       # Database connections management
│   │   ├── dashboard/         # Main dashboard
│   │   ├── execution-plans/   # Execution plan viewer
│   │   ├── monitoring/        # Real-time monitoring
│   │   ├── plan-baselines/    # SQL Plan Baselines
│   │   ├── profile/           # User profile
│   │   ├── reports/           # Report generation
│   │   ├── settings/          # System settings
│   │   ├── trace/             # SQL tracing
│   │   ├── tuning/            # Tuning tasks management
│   │   └── layout.tsx         # Dashboard layout with auth check
│   ├── api/
│   │   ├── advisor/           # Oracle advisor APIs
│   │   ├── analysis/          # Analysis APIs
│   │   ├── auth/              # NextAuth routes
│   │   ├── awr/               # AWR/ASH APIs
│   │   ├── dbms-xplan/        # DBMS_XPLAN APIs
│   │   ├── monitoring/        # Monitoring APIs
│   │   ├── oracle/            # Oracle connection APIs
│   │   ├── plan-baselines/    # Plan baseline APIs
│   │   ├── reports/           # Report APIs
│   │   ├── tuning/            # Tuning task APIs
│   │   └── ...
│   ├── auth/                  # Auth pages
│   ├── layout.tsx             # Root layout with providers
│   ├── providers.tsx          # Client providers (Query, Theme)
│   └── page.tsx               # Homepage
├── components/
│   ├── auth/                  # Auth components (AuthProvider)
│   ├── charts/                # Chart components (Recharts, D3)
│   ├── dashboard/             # Dashboard layout components
│   ├── database/              # Database selector, connection UI
│   └── ui/                    # Shadcn UI components
├── hooks/
│   ├── use-selected-database.ts  # Database selection hook
│   └── use-toast.ts              # Toast notifications hook
├── lib/
│   ├── auth.ts                # NextAuth configuration
│   ├── crypto.ts              # AES-256 encryption for credentials
│   ├── utils.ts               # Utility functions (cn helper)
│   ├── oracle/                # Oracle database client
│   │   ├── client.ts          # Connection pool, queries
│   │   ├── types.ts           # Oracle types
│   │   └── mock-client.ts     # Mock for testing
│   ├── reports/               # Report generation
│   │   ├── pdf-generator.ts   # PDF generation
│   │   └── korean-font.ts     # Korean font support
│   ├── scheduler/             # Scheduled tasks
│   ├── stores/                # Zustand stores
│   │   └── database-store.ts  # Database connection state
│   └── supabase/              # Supabase clients
│       ├── client.ts          # Browser client
│       ├── server.ts          # Server client
│       └── types.ts           # Database types

supabase/
└── migrations/                # SQL migration files (numbered)
    ├── 0001_create_core_tables.sql
    ├── 0002_create_sql_monitoring_tables.sql
    ├── 0003_create_tuning_tables.sql
    ├── 0004_create_awr_reports_table.sql
    ├── 0005_create_statspack_tables.sql
    ├── 0006_create_stats_collection_history.sql
    └── 0007_create_reports_tables.sql
```

## Critical Coding Rules

### Next.js Specifics
- **Always use `use client` directive** for client components (project convention)
- **Page params must be awaited** in Next.js 15:
  ```tsx
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
  }
  ```
- Use `export const dynamic = 'force-dynamic'` for pages requiring fresh data

### Component Guidelines
- Client components by default (use `use client`)
- Server components for layouts requiring auth check (see dashboard layout)
- Use `server-only` package for server-specific code (see `src/lib/oracle/client.ts`)

### Authentication Pattern
```tsx
// In API routes
const session = await getServerSession(authOptions);
if (!session?.user?.email) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// In server components
const session = await getServerSession(authOptions);
if (!session) {
  redirect('/auth/signin');
}
```

### Oracle Database Integration
- **Connection pooling**: Pools are cached by host:port:serviceName/sid key
- **Health checks**: Use `healthCheck()` before saving connections
- **Password encryption**: Always encrypt with `encrypt()` from `@/lib/crypto`
- **Error handling**: Translate Oracle errors (ORA-XXXXX) to user-friendly messages
- **Server-only**: Import oracle client only in API routes (uses `server-only`)

### Supabase Integration
- **Client-side**: Use `createClient()` from `src/lib/supabase/client.ts`
- **Server-side**: Use `createClient()` from `src/lib/supabase/server.ts`
- **Pure server**: Use `createPureClient()` for service role operations
- **Migrations**:
  - Store in `supabase/migrations/` as `.sql` files
  - Use numbered prefixes (e.g., `0001_create_users_table.sql`)
  - Must be idempotent (use `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`)
  - Include `updated_at` column with trigger on all tables
  - Use RLS policies for access control
  - Do not run Supabase locally - use cloud instance

### API Route Pattern
```tsx
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createPureClient();
    // ... query logic

    return NextResponse.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### UI Components (Shadcn)
- When adding new Shadcn components:
  ```bash
  npx shadcn@latest add [component-name]
  ```
- Components are in `src/components/ui/`
- Use Tailwind with HSL custom properties
- Ensure responsive and accessible design

### State Management Patterns
- **Server state**: React Query with `@tanstack/react-query`
- **Database selection**: `useDatabaseStore()` from Zustand
- **Client state**: Zustand for global, useState/useReducer for local
- **Forms**: React Hook Form + Zod validation
- **Theme**: next-themes with system preference detection

### Provider Architecture
Root layout wraps children with:
1. `Providers` (client) - ThemeProvider + QueryClientProvider
2. `AuthProvider` - NextAuth session provider
3. `Toaster` + `Sonner` - notifications

### Styling Conventions
- Tailwind utility classes (utility-first approach)
- Use `cn()` helper from `src/lib/utils.ts` for conditional classes
- HSL color system via CSS variables
- Dark mode via class strategy
- Custom theme tokens in `tailwind.config.ts`

### TypeScript Configuration
- Strict mode enabled (with `strictNullChecks: false`, `noImplicitAny: false`)
- Path alias: `@/*` → `./src/*`
- Target ES2017

### Code Style
- Functional programming preferred
- Pure functions, immutability, composition over inheritance
- Early returns, descriptive names, DRY principles
- Minimize AI-generated comments - use clear variable/function names
- Document "why" not "what"
- Use JSDoc for complex functions
- Korean language for user-facing strings and comments

### Package Management
- **Use npm** as package manager (not yarn/pnpm)

### Image Handling
- Use `picsum.photos` for placeholder images

### Korean Text
- Application locale is Korean (`lang="ko"`)
- Verify UTF-8 encoding correctness after generating code with Korean text

## Environment Variables

Required environment variables:
```bash
# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Oracle (optional - for Thick mode)
ORACLE_THICK_MODE=true
ORACLE_CLIENT_LIB_DIR=/path/to/instant_client

# Encryption
ENCRYPTION_KEY=  # 32 bytes for AES-256
```

## MCP Integration

Project uses Supabase MCP server for database operations. Connection configured in `.mcp.json` with project reference `fhnphmjpvawmljdvhptj`.

When working with Supabase:
- Use MCP tools for migrations, queries, and table operations
- Migration files follow strict naming/structure requirements
- Always check for advisor notices after DDL changes
