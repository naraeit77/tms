# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Narae TMS v2.0** - SQL Tuning Management System by 주식회사 나래정보기술

Next.js 15 application using React 19, TypeScript, Tailwind CSS, and Shadcn UI. Built with EasyNext framework, using local PostgreSQL 17 with Drizzle ORM and NextAuth for authentication.

This is a professional SQL tuning and performance management system for Oracle databases, providing comprehensive performance monitoring, SQL analysis, and automated tuning recommendations.

## Development Commands

```bash
# Development server with Turbopack
npm run dev

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
- **React 19** with React Server Components and Client Components
- **TypeScript** with path alias `@/*` → `./src/*`

### State & Data Management
- **React Query** (`@tanstack/react-query`) - server state management with 60s staleTime default
- **Zustand** - lightweight global client state
- **React Hook Form** + **Zod** - form validation and schema validation

### Authentication & Backend
- **NextAuth v4** - JWT strategy with bcrypt credentials provider, configured in `src/lib/auth.ts`
- **PostgreSQL 17** - Local database (`tms` DB, `tms_app` user)
- **Drizzle ORM** - Type-safe ORM with `pg` driver
  - DB instance: `src/db/index.ts`
  - Schema: `src/db/schema/` (7 files: users, connections, monitoring, tuning, awr, reports, performance)
  - Config: `drizzle.config.ts`

### UI & Styling
- **Tailwind CSS** - utility-first with custom theme (HSL color system)
- **Shadcn UI** - accessible components in `src/components/ui/`
- **Radix UI** - headless primitives for Shadcn
- **Lucide React** - icon system
- **Framer Motion** - animations
- **next-themes** - dark mode support with class strategy

### Utilities
- **date-fns** - date manipulation
- **ts-pattern** - type-safe pattern matching
- **es-toolkit** - utility functions (preferred over lodash)
- **react-use** - common React hooks
- **clsx** + **class-variance-authority** - conditional classes

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/auth/          # NextAuth routes
│   ├── layout.tsx         # Root layout with providers
│   ├── providers.tsx      # Client-side providers (QueryClient, ThemeProvider)
│   └── page.tsx           # Homepage
├── components/
│   ├── ui/                # Shadcn UI components
│   └── auth/              # Auth-related components (AuthProvider)
├── db/
│   ├── index.ts           # PostgreSQL pool + Drizzle instance
│   ├── schema/            # Drizzle schema definitions (7 files)
│   └── seed.ts            # Seed data script
├── lib/
│   ├── utils.ts           # Utility functions (cn helper, etc.)
│   ├── auth.ts            # NextAuth configuration (bcrypt + Drizzle)
│   ├── crypto.ts          # Encryption utilities
│   └── oracle/            # Oracle DB connection utilities
├── features/              # Feature-based modules (when needed)
│   └── [featureName]/
│       ├── components/    # Feature-specific components
│       ├── hooks/         # Feature-specific hooks
│       ├── lib/           # Feature-specific utilities
│       ├── constants/     # Feature-specific constants
│       └── api.ts         # API fetch functions
├── constants/             # Global constants
├── hooks/                 # Global hooks
└── remote/                # HTTP client configuration

```

## Critical Coding Rules

### Next.js Specifics
- **Always use `use client` directive** for all components (per project convention)
- **Page params must be awaited**: Use `Promise` type for `page.tsx` params props
  ```tsx
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
  }
  ```

### Component Guidelines
- Client components by default (use `use client`)
- Server components only when explicitly needed (e.g., data fetching, server actions)
- Use `server-only` package for server-specific code

### Authentication
- Use NextAuth session for all authentication
- Session strategy: JWT
- Custom session user type includes `id` field
- Auth provider wraps app in `src/app/layout.tsx`

### Database (PostgreSQL + Drizzle ORM)
- **DB instance**: Use `db` from `@/db` for all database operations
- **Schema**: Define tables in `src/db/schema/` using Drizzle's `pgTable()`
- **Queries**: Use Drizzle query builder (`db.select()`, `db.insert()`, `db.update()`, `db.delete()`)
- **Operators**: Import from `drizzle-orm` (`eq`, `and`, `or`, `desc`, `gte`, `lte`, `inArray`, `sql`, etc.)
- **Schema conventions**:
  - Column names: camelCase in schema, snake_case in DB
  - All tables include `created_at` and `updated_at` with timezone
  - UUID primary keys with `gen_random_uuid()`
  - `updated_at` triggers on all tables
- **Connection**: `DATABASE_URL=postgresql://tms_app:song7409@localhost:5432/tms`

### UI Components (Shadcn)
- When adding new Shadcn components, provide installation command:
  ```bash
  npx shadcn@latest add [component-name]
  ```
- Components are in `src/components/ui/`
- Use Tailwind for styling with HSL custom properties
- Ensure responsive and accessible design

### State Management Patterns
- **Server state**: React Query with `@tanstack/react-query`
- **Client state**: Zustand for global, useState/useReducer for local
- **Forms**: React Hook Form + Zod validation
- **Theme**: next-themes with system preference detection

### Provider Architecture
Root layout wraps children with:
1. `Providers` (client component) - ThemeProvider + QueryClientProvider
2. `AuthProvider` - NextAuth session provider

QueryClient configuration:
- Singleton pattern for browser
- Fresh instance per request on server
- 60s default staleTime for SSR optimization

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

### Package Management
- **Use npm** as package manager (not yarn/pnpm)

### Image Handling
- Use `picsum.photos` for placeholder images

### Korean Text
- Verify UTF-8 encoding correctness after generating code with Korean text

## MCP Integration

Project uses Context7 and Sequential Thinking MCP servers for documentation lookup and complex analysis. Configured in `.mcp.json`.
