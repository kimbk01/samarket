export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/my/reported-posts (세션) — 거래 H RP-2 (2026-10-28): 내가 신고한 거래 글 id.
 * 「신고한 글」 가림을 기기 저장소가 아니라 서버(`reports`)에서 읽어 다른 기기에서도 같게 한다. 읽기 전용, 새 테이블 없음.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const MAX_IDS = 1000;

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  const { data, error } = await (sb as import("@supabase/supabase-js").SupabaseClient<any>)
    .from("reports")
    .select("target_id")
    .eq("reporter_id", auth.userId)
    .eq("target_type", "product")
    .order("created_at", { ascending: false })
    .limit(MAX_IDS);
  if (error) return NextResponse.json({ ok: false, error: "reported_posts_load_failed" }, { status: 500 });
  const postIds = [
    ...new Set(
      (data ?? [])
        .map((row) => (typeof (row as { target_id?: unknown }).target_id === "string" ? (row as { target_id: string }).target_id.trim() : ""))
        .filter(Boolean)
    ),
  ];
  return NextResponse.json({ ok: true, postIds }, { headers: { "Cache-Control": "private, no-store" } });
}
