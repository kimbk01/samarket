import { NextRequest, NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { feedAdViewerKey } from "@/lib/ads/feed-ad-viewer-key";
import { adEventRecordActorKey, enforceAdEventRecordQuota } from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel 이 덮어쓰는 접속 IP 헤더(x-real-ip → x-forwarded-for 첫 값) */
function clientIp(req: NextRequest): string | null {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/**
 * FB-E07: 기록할 수 있는 피드 배너 위치 — `FeedAdPlacement` 4종(거래 홈·거래 카테고리·커뮤니티 전체·커뮤니티 주제).
 * 앱 호출처(`FeedAdBannerCarousel` 3곳)는 이 값만 보낸다.
 */
const FEED_AD_EVENT_PLACEMENTS: ReadonlySet<string> = new Set([
  "TRADE_HOME",
  "TRADE_CATEGORY",
  "COMMUNITY_HOME",
  "COMMUNITY_TOPIC",
]);

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
  // FB-E07: 소재 id 없는 요청 · 목록에 없는 위치 값은 400 (키 `'-'` 행 금지). 앱은 슬라이드 = 소재 id(uuid)를 항상 보낸다.
  if (!isUuidLikeString(creativeId)) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const placement = String(body.placement ?? "").trim();
  if (!FEED_AD_EVENT_PLACEMENTS.has(placement)) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const userId = await getOptionalAuthenticatedUserId();
  const viewer = feedAdViewerKey({ userId, ip: clientIp(req) });
  if (!viewer) return NextResponse.json({ ok: false, error: "viewer_unknown" }, { status: 400 });

  // D-21 ③: 요청 제한(회원 id · 없으면 IP 해시). 넘으면 429 — 앱은 보내고 기다리지 않는다(화면 영향 없음).
  const quota = await enforceAdEventRecordQuota("feed_ad_events", adEventRecordActorKey({ userId, ip: clientIp(req) }));
  if (!quota.ok) return quota.response;

  const record = (type: "impression" | "click") =>
    sb.rpc("record_feed_ad_event", {
      p_campaign_id: campaignId,
      p_creative_id: creativeId,
      p_event_type: type,
      p_placement: placement,
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
