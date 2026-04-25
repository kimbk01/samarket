import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { validateActiveSession } from "@/lib/auth/server-guards";

/**
 * Route Handler용 관리자 판별.
 * - **로그인만으로 관리자가 되지 않음** — `profiles.role` 서버 조회만 허용.
 */
export async function isRouteAdmin(): Promise<boolean> {
  const uid = await getRouteUserId();
  if (!uid) return false;
  const session = await validateActiveSession(uid);
  if (!session.ok) return false;

  const sb = tryGetSupabaseForStores();

  if (sb) {
    const { data: prof } = await sb.from("profiles").select("role").eq("id", uid).maybeSingle();
    if (isPrivilegedAdminRole(prof?.role)) return true;
  }

  return false;
}
