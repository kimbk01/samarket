import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import type { AdminUser } from "@/lib/types/admin-user";
import type { MemberType } from "@/lib/types/admin-user";

/**
 * 관리자 회원 목록 — test_users 테이블 기준 (서비스 롤)
 * GET /api/admin/users (관리자 세션)
 */
export async function GET(_req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const anon = createClient(url, anonKey);

  const supabase = serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : anon;

  const { data: rows, error } = await (supabase as any)
    .from("test_users")
    .select("id, username, role, display_name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list: AdminUser[] = (rows ?? []).map((r: any) => {
    const memberType: MemberType =
      r.role === "admin" ? "admin" : r.role === "special" || r.role === "premium" ? "premium" : "normal";
    return {
      id: r.id,
      loginUsername: r.username ?? undefined,
      nickname: r.display_name?.trim() || r.username || r.id,
      memberType,
      moderationStatus: "normal",
      productCount: 0,
      soldCount: 0,
      reviewCount: 0,
      reportCount: 0,
      chatCount: 0,
      joinedAt: r.created_at ?? new Date().toISOString(),
    };
  });

  return NextResponse.json({ users: list });
}
