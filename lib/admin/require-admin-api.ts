import { NextResponse } from "next/server";
import { verifyAdminUserId } from "@/lib/admin/verify-admin-user-server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";

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
  if (!(await verifyAdminUserId(url, anonKey, auth.userId))) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "관리자만 가능합니다." }, { status: 403 }),
    };
  }
  return { ok: true, userId: auth.userId };
}
