# 사용자 역할별 권한 (Permissions)

> 마지막 갱신: 2026-05-09
> 대상 코드: TMS v2.0 — `src/db/seed.ts`, `src/lib/admin-guard.ts`, `src/components/dashboard/sidebar.tsx`, `src/app/(dashboard)/admin/layout.tsx`

이 문서는 Narae TMS v2.0 의 사용자 역할(`admin` · `tuner` · `viewer`) 이 가진 권한을 두 시점으로 나눠 정리합니다. **정의된 권한**(seed 의 JSONB) 과 **실제 enforce 되는 권한**(코드 검사 결과) 이 다르므로 두 표를 모두 확인해 주세요.

## 1. 정의된 권한 — `user_roles.permissions` (`src/db/seed.ts:10-16`)

`user_roles.permissions` JSONB 컬럼에 시드되어 NextAuth 세션의 `user.permissions` 로 노출됩니다. 다만 **현재 코드는 이 값을 읽지 않습니다** (`grep -r "permissions\["` → 0 건).

| 권한 키 | 설명 | admin | tuner | viewer |
|---|---|:---:|:---:|:---:|
| `manage_users` | 사용자 등록 / 수정 / 삭제 | ✅ | ❌ | ❌ |
| `manage_connections` | DB 연결 등록 / 수정 / 삭제 | ✅ | ❌ | ❌ |
| `manage_settings` | 시스템 환경설정 변경 | ✅ | ❌ | ❌ |
| `manage_tuning` | 튜닝 작업 생성 / 수정 | ✅ | ✅ | ❌ |
| `view_all_data` | 모든 데이터 조회 | ✅ | ✅ | ✅ |
| `export_data` | 데이터 내보내기 | ✅ | ✅ | ❌ |

## 2. 실제로 enforce 되는 권한 (코드 검사 결과)

`session.user.role` 비교 또는 `requireAdmin()` 호출이 있는 위치만 진짜 권한입니다.

| 영역 | admin | tuner | viewer | enforce 위치 |
|---|:---:|:---:|:---:|---|
| `/admin/users` 페이지 접근 | ✅ | 🚫 | 🚫 | `src/app/(dashboard)/admin/layout.tsx:13` (server redirect) |
| `/api/admin/users/**` | ✅ | 🚫 | 🚫 | `src/lib/admin-guard.ts` (`requireAdmin`) |
| 사이드바 "사용자 관리" 메뉴 노출 | ✅ | ❌ | ❌ | `src/components/dashboard/sidebar.tsx:195` |
| 헤더 / 프로필 역할 라벨 | "관리자" | "튜너" | "뷰어" | `header.tsx:62`, `profile/page.tsx:164` (표시만) |
| **그 외 모든 기능** (DB 연결 CRUD · 모니터링 · 튜닝 작업 · 리포트 · 설정 · advisor) | ✅ | ✅ | ✅ | **role 체크 없음** — 인증만 통과하면 동일 동작 |

> **RLS 격리는 별개 축입니다.** `oracle_connections` 는 RLS 로 본인 소유만 보이지만, 이는 role 과 무관한 사용자별 격리입니다. tuner / viewer 도 본인 소유 connection 은 자유롭게 CRUD 가능합니다.

## 3. 갭 (현재의 한계)

- enforce 되는 권한은 사실상 **"admin 인가 아닌가"** 단 하나
- tuner ↔ viewer 코드상 동일하게 동작
- `manage_connections=false` 인 viewer 가 DB 연결 등록 가능
- `manage_tuning=false` 인 viewer 가 튜닝 작업 생성/수정 가능
- `export_data=false` 인 viewer 가 export API 호출 가능
- `permissions` JSONB 는 세션에 실리기만 하고 사용처 없음

신규 가입자는 자동으로 viewer 로 등록(`src/app/api/auth/signup/route.ts:69`)되지만, 사용자 관리 빼고는 admin 과 동일한 기능을 사용합니다. SaaS 멀티테넌시 격리는 RLS 가 막아주므로 다른 사용자 데이터는 보이지 않지만, 같은 워크스페이스 내 read-only 시나리오는 현재 보호되지 않습니다.

## 4. 재현

```bash
# role 체크 위치 모두 출력
grep -rn "session.user.role\|requireAdmin\|user\.role ===" src --include="*.ts" --include="*.tsx"

# permissions JSONB 사용처 (0건)
grep -rn "permissions\[" src --include="*.ts" --include="*.tsx"

# seed 정의 확인
grep -A 30 "userRoles" src/db/seed.ts
```

## 5. 향후 RBAC 강화 시 작업 항목

이 갭이 문제가 될 때 다음 순서로 보강:

1. `src/lib/permissions.ts` — `requireRole(['tuner','admin'])`, `can(session, 'manage_tuning')` 헬퍼
2. 튜닝/연결/설정 API 라우트에 가드 추가
3. viewer 의 UI 편집 버튼을 hidden 또는 disabled 로 처리
4. (선택) `permissions` JSONB 를 admin UI 에서 편집 가능하게
