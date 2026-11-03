import { NextRequest, NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/feed-ads/events — Owner 결정 O-4 (2026-11-03) 피드 배너 노출·클릭 기록.
 * 중복 방지 키·노출 가능 여부(캠페인 노출 중·소재 소속)는 DB 함수 `record_feed_ad_event` 가 정한다.
 * 같은 키 재전송은 `deduped: true` (숫자 그대로).
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const eventType = String(body.eventType ?? "");
  const campaignId = String(body.campaignId ?? "").trim();
  const creativeId = String(body.creativeId ?? "").trim();
  if ((eventType !== "impression" && eventType !== "click") || !isUuidLikeString(campaignId)) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (creativeId && !isUuidLikeString(creativeId)) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const userId = await getOptionalAuthenticatedUserId();
  const slot = Number(body.slotOrdinal);
  const { data, error } = await sb.rpc("record_feed_ad_event", {
    p_campaign_id: campaignId,
    p_creative_id: creativeId || null,
    p_event_type: eventType,
    p_placement: String(body.placement ?? "").slice(0, 64) || null,
    p_session_id: String(body.feedSessionId ?? "").slice(0, 128) || null,
    p_slot_ordinal: Number.isFinite(slot) ? Math.max(0, Math.floor(slot)) : 0,
    p_user_id: userId,
  });
  if (error) return NextResponse.json({ ok: false, error: "record_failed" }, { status: 500 });
  const res = (data ?? {}) as { ok?: boolean; error?: string; deduped?: boolean };
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error ?? "rejected" }, { status: 409 });
  return NextResponse.json({ ok: true, deduped: res.deduped === true });
}
