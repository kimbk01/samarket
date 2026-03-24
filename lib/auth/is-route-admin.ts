import { isAdminRequireAuthEnabled, isAdminUser } from "@/lib/auth/admin-policy";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

/**
 * Route Handler용 관리자 판별.
 * - `NEXT_PUBLIC_ADMIN_REQUIRE_AUTH` 가 true가 아니면 `AdminGuard`와 같이 기본 허용(로컬·스테이징).
 * - 강제 시: profiles.role ∈ admin, master / dev·test_users / 허용 이메일(세션)
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
    const pr = prof?.role;
    if (pr === "admin" || pr === "master") return true;

    const { data: tu } = await sb.from("test_users").select("role").eq("id", uid).maybeSingle();
    const tr = tu?.role;
    if (tr === "admin" || tr === "master") return true;
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
