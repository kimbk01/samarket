import { NextResponse } from "next/server";
import { verifyAdminAccess } from "@/lib/admin/verify-admin-user-server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

export async function requireAdminApiUser(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: supabaseEnv.error }, { status: 500 }),
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

  if (
    !(await verifyAdminAccess(
      supabaseEnv.url,
      supabaseEnv.anonKey,
      auth.userId,
      sessionEmail,
      supabaseEnv.serviceKey
    ))
  ) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "관리자만 가능합니다." }, { status: 403 }),
    };
  }
  return { ok: true, userId: auth.userId };
}
