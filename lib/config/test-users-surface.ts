import { allowTestUsersSurface } from "@/lib/config/deploy-surface";

/**
 * `test_users` 기반 아이디 로그인·테스트 회원가입 노출 정책.
 *
 * - `NEXT_PUBLIC_APP_DEPLOY_TIER=production` → 항상 OFF (플래그 무시)
 * - `local` → 기본 ON
 * - `staging` → `NEXT_PUBLIC_ENABLE_TEST_USERS_UI=1` 일 때만 ON
 *
 * @see docs/cleanup-inventory.md
 * @see lib/config/deploy-surface.ts
 */
export function isTestUsersSurfaceEnabled(): boolean {
  return allowTestUsersSurface();
}
