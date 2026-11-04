import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import {
  computePlatformPopupSuppressUntil,
} from "@/lib/platform-popup/suppression";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";
import { PLATFORM_POPUP_DEFAULT_TIMEZONE } from "@/lib/platform-popup/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { getClientIp } from "@/lib/http/api-route";
import { adEventRecordActorKey, enforceAdEventRecordQuota } from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = new Set<PlatformPopupSuppressionMode>([
  "CLOSE",
  "SESSION",
  "TODAY",
  "DURATION",
  "CAMPAIGN",
]);

/**
 * POST /api/platform-popup/suppress
 * Logged-in: server canonical. Anonymous: requires deviceKey (server stores anon row).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    campaignId?: string;
    mode?: string;
    sessionKey?: string | null;
    deviceKey?: string | null;
    durationSeconds?: number | null;
    timezone?: string | null;
    campaignRevision?: string | null;
  };

  const campaignId = String(body.campaignId ?? "").trim();
  const mode = String(body.mode ?? "").trim() as PlatformPopupSuppressionMode;
  if (!campaignId) {
    return NextResponse.json({ ok: false, error: "missing_campaign_id" }, { status: 400 });
  }
  if (!MODES.has(mode)) {
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }

  const userId = await getOptionalAuthenticatedUserId();
  const deviceKey = String(body.deviceKey ?? "").trim() || null;
  if (!userId && !deviceKey) {
    return NextResponse.json({ ok: false, error: "missing_actor" }, { status: 400 });
  }

  /**
   * PU-31 · D-21 ①: CLOSE(×) 는 효과가 없는 기록이라 DB 행을 쓰지 않는다(지금 앱은 보내지 않음 · 구 앱 호환으로 성공만 답함).
   */
  if (mode === "CLOSE") {
    return NextResponse.json({ ok: true, mode, suppressUntil: null, skipped: true });
  }

  // D-21 ③: 요청 제한(회원 id · 없으면 IP 해시). 넘으면 429 — 앱은 이미 닫았고 실패를 무시한다.
  const quota = await enforceAdEventRecordQuota(
    "platform_popup_suppress",
    adEventRecordActorKey({ userId, ip: getClientIp(req) })
  );
  if (!quota.ok) return quota.response;

  /**
   * 광고 감사 G-9: 「오늘」 끝 = **캠페인 시간대** 기준(계약 §4). 캠페인 행의 timezone 이 정본이고,
   * 행을 못 읽을 때만 요청 값 → 기본(Asia/Manila).
   */
  const { data: campaignRow } = await sb
    .from("platform_popup_campaigns")
    .select("timezone")
    .eq("id", campaignId)
    .maybeSingle();
  const timezone =
    String((campaignRow as { timezone?: unknown } | null)?.timezone ?? "").trim() ||
    body.timezone?.trim() ||
    PLATFORM_POPUP_DEFAULT_TIMEZONE;
  const now = new Date();
  // PU-31: CLOSE 는 위에서 행 없이 끝난다 — 여기는 효과 있는 숨김만
  const suppressUntil = computePlatformPopupSuppressUntil(mode, {
    now,
    timezone,
    durationSeconds: body.durationSeconds,
  });

  const { error } = await sb.from("platform_popup_user_suppressions").insert({
    user_id: userId,
    anonymous_device_key: userId ? null : deviceKey,
    campaign_id: campaignId,
    mode,
    session_key: mode === "SESSION" ? String(body.sessionKey ?? "").trim() || null : null,
    suppress_until: suppressUntil ? suppressUntil.toISOString() : null,
    campaign_revision: mode === "CAMPAIGN" ? String(body.campaignRevision ?? "").trim() || null : null,
    timezone,
  });

  if (error) {
    console.error("[platform-popup/suppress] insert_failed", error.message);
    return NextResponse.json({ ok: false, error: "suppress_write_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mode,
    suppressUntil: suppressUntil ? suppressUntil.toISOString() : null,
  });
}
