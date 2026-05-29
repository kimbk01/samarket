/**
 * `StoreBusinessGuard` phase=ok 래퍼 — `ConditionalAppShell` 오너 라우트 flex 자식.
 * DO NOT: `min-h-screen` — 뷰포트 잠금 아래 flex 체인이 깨져 `.owner-compact-shell__scroll` 이 동작하지 않음.
 * (동일 금지: `lib/addresses/mypage-address-manage-layout.ts`)
 */
export const OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col";
