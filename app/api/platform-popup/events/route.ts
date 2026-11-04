import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { canEmitPlatformPopupEventFromSource } from "@/lib/platform-popup/events";
import type { PlatformPopupEventType } from "@/lib/platform-popup/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { getClientIp } from "@/lib/http/api-route";
import {
  adEventRecordActorKey,
  claimPlatformPopupEventDedupe,
  enforceAdEventRecordQuota,
} from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set<PlatformPopupEventType>([
  "impression",
  "click",
  "dismiss",
  "suppress",
  "landing_success",
  "landing_failure",
]);

type EventSource =
  | "renderer"
  | "click_handler"
  | "dismiss_handler";

/**
 * POST /api/platform-popup/events
 * Canonical campaign event write (impression on render-complete only from renderer).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    campaignId?: string;
    creativeId?: string | null;
    surface?: string | null;
    eventType?: string;
    source?: EventSource;
    exposureId?: string | null;
    deviceKey?: string | null;
    meta?: Record<string, unknown> | null;
  };

  const campaignId = String(body.campaignId ?? "").trim();
  const eventType = String(body.eventType ?? "").trim() as PlatformPopupEventType;
  const source = (body.source ?? "renderer") as EventSource;

  if (!campaignId) {
    return NextResponse.json({ ok: false, error: "missing_campaign_id" }, { status: 400 });
  }
  if (!EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ ok: false, error: "invalid_event_type" }, { status: 400 });
  }
  if (!canEmitPlatformPopupEventFromSource(eventType, source)) {
    return NextResponse.json({ ok: false, error: "event_source_forbidden" }, { status: 403 });
  }

  const userId = await getOptionalAuthenticatedUserId();
  const deviceKey = String(body.deviceKey ?? "").trim() || null;

  if (!userId && !deviceKey && eventType !== "eligible") {
    return NextResponse.json({ ok: false, error: "missing_actor" }, { status: 400 });
  }

  // D-21 ③: 요청 제한(회원 id · 없으면 IP 해시). 넘으면 429 — 앱은 기록 실패를 무시한다(화면 영향 없음).
  const quota = await enforceAdEventRecordQuota(
    "platform_popup_events",
    adEventRecordActorKey({ userId, ip: getClientIp(req) })
  );
  if (!quota.ok) return quota.response;

  // D-21 ④: 같은 보는 사람 · 소재 · 종류는 10분에 1번만 저장 — 넘치면 저장 생략하고 성공으로 답한다.
  const creativeId = body.creativeId?.trim() || null;
  const fresh = await claimPlatformPopupEventDedupe({
    viewerKey: userId ? `u:${userId}` : `d:${deviceKey}`,
    campaignId,
    creativeId,
    eventType,
  });
  if (!fresh) {
    return NextResponse.json({ ok: true, eventType, deduped: true });
  }

  const { error } = await sb.from("platform_popup_campaign_events").insert({
    campaign_id: campaignId,
    creative_id: creativeId,
    event_type: eventType,
    surface: body.surface?.trim() || null,
    user_id: userId,
    anonymous_device_key: userId ? null : deviceKey,
    meta: {
      exposureId: body.exposureId ?? null,
      ...(body.meta ?? {}),
    },
  });

  if (error) {
    // AL-19 와 같은 원칙: DB 원문 오류는 응답에 싣지 않는다(서버 로그만)
    console.error("[platform-popup/events] insert_failed", error.message);
    return NextResponse.json({ ok: false, error: "record_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventType });
}
