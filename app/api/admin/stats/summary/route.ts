/**
 * GET /api/admin/stats/summary — 대시보드용 집계 (service role)
 * - totalFavorites: favorites 테이블 전체 행 수 (총 찜 건수)
 */
import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json(
      { totalFavorites: null, updatedAt: null, error: "server_config" },
      { status: 500 }
    );
  }

  const sbAny = sb;
  const { count, error } = await sbAny
    .from("favorites")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { totalFavorites: null, updatedAt: new Date().toISOString(), error: error.message },
      { status: 500 }
    );
  }

  const totalFavorites = count ?? 0;
  const updatedAt = new Date().toISOString();

  return NextResponse.json({
    totalFavorites,
    updatedAt,
  });
}
