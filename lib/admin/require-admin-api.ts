import { NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireAdmin, requireAuth, validateActiveSession } from "@/lib/auth/server-guards";

export async function requireAdminApiUser(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return { ok: false, response: session.response };
  const admin = await requireAdmin(auth.userId);
  if (!admin.ok) return { ok: false, response: admin.response };
  return { ok: true, userId: auth.userId };
}

/**
 * RSC·서버 유틸 — 관리자일 때만 userId 반환 (페이지 시드 등). API 라우트는 `requireAdminApiUser` 유지.
 */
export async function getOptionalAdminUserId(): Promise<string | null> {
  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) return null;
  const session = await validateActiveSession(userId);
  if (!session.ok) return null;
  const admin = await requireAdmin(userId);
  if (!admin.ok) return null;
  return userId;
}
