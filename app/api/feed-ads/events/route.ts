import { NextRequest, NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { feedAdViewerKey } from "@/lib/ads/feed-ad-viewer-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel 이 덮어쓰는 접속 IP 헤더(x-real-ip → x-forwarded-for 첫 값) */
function clientIp(req: NextRequest): string | null {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/**
 * POST /api/feed-ads/events — Owner 결정 O-4 피드 배너 노출·클릭 기록.
 * 노출 가능 여부(캠페인 노출 중·소재 소속)·중복 방지는 DB 함수 `record_feed_ad_event` 가 정한다.
 * 클릭은 같은 사람의 노출을 먼저 기록한 뒤 기록한다(클릭 수 ≤ 노출 수).
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
  const viewer = feedAdViewerKey({ userId, ip: clientIp(req) });
  if (!viewer) return NextResponse.json({ ok: false, error: "viewer_unknown" }, { status: 400 });

  const record = (type: "impression" | "click") =>
    sb.rpc("record_feed_ad_event", {
      p_campaign_id: campaignId,
      p_creative_id: creativeId || null,
      p_event_type: type,
      p_placement: String(body.placement ?? "").slice(0, 64) || null,
      p_session_id: viewer,
      p_slot_ordinal: 0,
      p_user_id: userId,
    });

  if (eventType === "click") {
    const imp = await record("impression");
    if (imp.error) return NextResponse.json({ ok: false, error: "record_failed" }, { status: 500 });
    const impRes = (imp.data ?? {}) as { ok?: boolean; error?: string };
    if (!impRes.ok) return NextResponse.json({ ok: false, error: impRes.error ?? "rejected" }, { status: 409 });
  }
  const { data, error } = await record(eventType);
  if (error) return NextResponse.json({ ok: false, error: "record_failed" }, { status: 500 });
  const res = (data ?? {}) as { ok?: boolean; error?: string; deduped?: boolean };
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error ?? "rejected" }, { status: 409 });
  return NextResponse.json({ ok: true, deduped: res.deduped === true });
}
