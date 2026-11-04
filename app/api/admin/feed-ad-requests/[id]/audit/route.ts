import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/feed-ad-requests/[id]/audit — 피드 신청 상세 감사 이력 (보완 §7 · 4-1 12번 「×」 2026-11-04).
 * 신청 대상(`feed_ad_request`) 감사 + 그 신청의 캠페인 대상(`feed_ad_campaign`) 감사를 시간 역순으로 돌려준다.
 * 내부 메모(reason_internal)는 관리자 화면 전용 응답이라 그대로 싣는다. DB 원문 오류는 응답에 싣지 않는다.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const requestId = id.trim();
  if (!requestId) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { data: reqRow } = await sb
    .from("feed_ad_requests")
    .select("id, campaign_id")
    .eq("id", requestId)
    .maybeSingle();
  const campaignId = (reqRow as { campaign_id?: string | null } | null)?.campaign_id ?? null;

  const filter = campaignId
    ? `and(target_type.eq.feed_ad_request,target_id.eq.${requestId}),and(target_type.eq.feed_ad_campaign,target_id.eq.${campaignId})`
    : `and(target_type.eq.feed_ad_request,target_id.eq.${requestId})`;
  const { data, error } = await sb
    .from("audit_logs")
    .select("id, action, actor_type, actor_id, before_json, after_json, created_at")
    .or(filter)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[admin feed-ad-requests audit]", error.message);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}
