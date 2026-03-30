import { createClient } from "@supabase/supabase-js";
import {
  isAdminRequireAuthEnabled,
  isAdminUser,
  isPrivilegedAdminRole,
} from "@/lib/auth/admin-policy";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

async function fetchTestUserRoleAnon(userId: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  const client = createClient(url, anon);
  const { data, error } = await client
    .from("test_users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return (data as { role?: string } | null)?.role ?? null;
}

/**
 * Route Handler용 관리자 판별.
 * - production·staging 배포 구간에서는 항상 인증·권한 검사.
 * - local만: `NEXT_PUBLIC_ADMIN_REQUIRE_AUTH` 미설정이면 편의상 허용.
 * - 검사 시: profiles.role ∈ admin, master / test_users / 허용 이메일(세션)
 * - 비프로덕션: 서비스 롤 조회 후에도 anon으로 test_users.role 재조회(권한·설정 불일치 보강)
 */
export async function isRouteAdmin(): Promise<boolean> {
  if (!isAdminRequireAuthEnabled()) {
    return true;
  }

  const uid = await getRouteUserId();
  if (!uid) return false;

  const sb = tryGetSupabaseForStores();

  if (sb) {
    const { data: prof } = await sb.from("profiles").select("role").eq("id", uid).maybeSingle();
    if (isPrivilegedAdminRole(prof?.role)) return true;

    const { data: tu } = await sb.from("test_users").select("role").eq("id", uid).maybeSingle();
    if (isPrivilegedAdminRole(tu?.role)) return true;
  }

  if (!isProductionDeploy()) {
    const tr = await fetchTestUserRoleAnon(uid);
    if (isPrivilegedAdminRole(tr)) return true;
  }

  const routeSb = await createSupabaseRouteHandlerClient();
  if (routeSb) {
    const {
      data: { user },
      error,
    } = await routeSb.auth.getUser();
    if (!error && user?.email && isAdminUser({ email: user.email, id: user.id })) {
      return true;
    }
  }

  return false;
}
