import { NextResponse } from "next/server";
import { verifyAdminAccess } from "@/lib/admin/verify-admin-user-server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

export async function requireAdminApiUser(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Supabase 설정 없음" }, { status: 500 }),
    };
  }
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth;

  let sessionEmail: string | null = null;
  const routeSb = await createSupabaseRouteHandlerClient();
  if (routeSb) {
    const {
      data: { user },
    } = await routeSb.auth.getUser();
    sessionEmail = user?.email ?? null;
  }

  if (!(await verifyAdminAccess(url, anonKey, auth.userId, sessionEmail))) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "관리자만 가능합니다." }, { status: 403 }),
    };
  }
  return { ok: true, userId: auth.userId };
}
