import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DS-2 (2026-11-04): 피드 배너 목적지 매장 선택기 — 공개 매장(승인 · 보임)만, 이름·slug 검색, 최대 20개.
 * 저장은 slug (`/stores/:slug` 로만 열림). 노출 단계 대상 확인(`feed-ad-exposure-filter`)과 같은 공개 조건.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const raw = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  const q = raw.replace(/[%_,()]/g, " ").trim();
  let query = sb
    .from("stores")
    .select("id, slug, store_name")
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    .not("slug", "is", null)
    .order("store_name", { ascending: true })
    .limit(20);
  if (q) query = query.or(`store_name.ilike.%${q}%,slug.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: "store_lookup_failed" }, { status: 500 });
  const stores = (data ?? [])
    .map((r) => {
      const row = r as { id?: string; slug?: string | null; store_name?: string | null };
      return { id: String(row.id ?? ""), slug: String(row.slug ?? "").trim(), name: String(row.store_name ?? "").trim() };
    })
    .filter((s) => s.slug);
  return NextResponse.json({ ok: true, stores });
}
