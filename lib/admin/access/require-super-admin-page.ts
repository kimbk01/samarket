import { cache } from "react";
import { getOptionalAdminUserIdCached } from "@/lib/admin/get-optional-admin-user-id-cached";
import { resolveEffectiveAdminRole } from "@/lib/admin/admin-membership";
import { isSuperAdminRole } from "@/lib/admin/admin-user-server";
import { isAdminRequireAuthEnabled } from "@/lib/auth/admin-policy";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

/**
 * 내부 운영 도구(manage · platform-system 메뉴) 페이지 서버 게이트 — super_admin 만 열람.
 * API 는 `requireSuperAdmin` 이 별도로 강제한다(이 함수는 URL 직접 진입 시 화면 노출 차단용).
 *
 * `app/admin/layout` 과 동일하게 `isAdminRequireAuthEnabled()` 가 꺼진 로컬 환경에서는
 * 서버 게이트를 건너뛴다(로컬 `AdminGuard` 테스트 역할 유지 — API 가드는 그대로 동작).
 */
async function canViewSuperAdminOnlyPageUncached(): Promise<boolean> {
  if (!isAdminRequireAuthEnabled()) return true;
  const userId = await getOptionalAdminUserIdCached();
  if (!userId) return false;
  try {
    const sb = getSupabaseServer();
    const role = await resolveEffectiveAdminRole(sb, userId);
    return isSuperAdminRole(role);
  } catch {
    return false;
  }
}

export const canViewSuperAdminOnlyPage = cache(canViewSuperAdminOnlyPageUncached);
