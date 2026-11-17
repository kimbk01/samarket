import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { getClientIp } from "@/lib/http/api-route";
import { LAUNCH_INTRO_EVENT_TYPES, type LaunchIntroEventType } from "@/lib/launch-intro/pool";
import { recordLaunchIntroEvent } from "@/lib/launch-intro/pool-server";
import { adEventRecordActorKey, enforceAdEventRecordQuota } from "@/lib/security/rate-limit-presets";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/launch-intro/events — 진입 감사 IN-8: 인트로 소재 노출·건너뛰기·누름·완료 기록.
 * 같은 노출(exposureId)의 같은 종류는 1번만(DB 고유 색인). 요청 제한 넘으면 429 — 앱은 실패를 무시한다.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const creativeId = String(body.creativeId ?? "").trim();
  const eventType = String(body.eventType ?? "").trim();
  const renderer = body.renderer === "web" ? "web" : body.renderer === "native" ? "native" : null;
  const exposureId = String(body.exposureId ?? "").trim();
  if (!UUID_RE.test(creativeId)) return NextResponse.json({ ok: false, error: "creative_invalid" }, { status: 400 });
  if (!(LAUNCH_INTRO_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return NextResponse.json({ ok: false, error: "event_type_invalid" }, { status: 400 });
  }
  if (!renderer) return NextResponse.json({ ok: false, error: "renderer_invalid" }, { status: 400 });
  if (!/^[0-9A-Za-z-]{8,64}$/.test(exposureId)) {
    return NextResponse.json({ ok: false, error: "exposure_invalid" }, { status: 400 });
  }
  const userId = await getOptionalAuthenticatedUserId();
  const quota = await enforceAdEventRecordQuota(
    "launch_intro_events",
    adEventRecordActorKey({ userId, ip: getClientIp(req) })
  );
  if (!quota.ok) return quota.response;
  const deviceKey = typeof body.deviceKey === "string" ? body.deviceKey.trim().slice(0, 80) || null : null;
  const platform = typeof body.platform === "string" ? body.platform.trim().slice(0, 12) || null : null;
  const href = typeof body.href === "string" ? body.href.slice(0, 500) : null;
  const res = await recordLaunchIntroEvent(sb, {
    creativeId,
    eventType: eventType as LaunchIntroEventType,
    renderer,
    platform,
    exposureId,
    deviceKey: userId ? null : deviceKey,
    userId,
    meta: href ? { href } : {},
  });
  if (!res.ok) {
    // 소재가 지워졌으면 저장 생략(정상)
    if (res.error === "creative_not_found") return NextResponse.json({ ok: true, skipped: true });
    return NextResponse.json({ ok: false, error: "record_failed" }, { status: res.status ?? 500 });
  }
  return NextResponse.json({ ok: true });
}
