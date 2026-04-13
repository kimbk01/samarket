import { NextResponse } from "next/server";
import { verifyAdminAccess } from "@/lib/admin/verify-admin-user-server";
import { getOptionalAuthenticatedUserId, requireAuthenticatedUserId } from "@/lib/auth/api-session";
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

/**
 * RSC·서버 유틸 — 관리자일 때만 userId 반환 (페이지 시드 등). API 라우트는 `requireAdminApiUser` 유지.
 */
export async function getOptionalAdminUserId(): Promise<string | null> {
  const supabaseEnv = requireSupabaseEnv({ requireAnonKey: true });
  if (!supabaseEnv.ok) return null;
  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) return null;

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
      userId,
      sessionEmail,
      supabaseEnv.serviceKey
    ))
  ) {
    return null;
  }
  return userId;
}
