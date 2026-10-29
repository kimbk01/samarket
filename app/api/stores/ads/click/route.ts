import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { getRateLimitKey } from "@/lib/http/api-route";
import {
  deliveryAdExposureTokenHash,
  deriveDeliveryAdClickEventId,
  hashDeliveryAdViewerSession,
} from "@/lib/stores/advertising/delivery-ad-exposure-token";
import { recordDeliveryAdClickFromToken } from "@/lib/stores/advertising/delivery-ad-event-writer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { enforceDeliveryAdClickQuota } from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  // 비로그인 허용 유지 — 로그인 = user, 비로그인 = IP 기준 분당 상한 (v4 W1 API-08).
  const buyerUserId = await getOptionalAuthenticatedUserId();
  const quota = await enforceDeliveryAdClickQuota(getRateLimitKey(req, buyerUserId));
  if (!quota.ok) return quota.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const exposureToken = String(body.exposureToken ?? "");
  // v4 W1 API-08 — 노출(ADS-10)과 같은 규칙: dedupe 키는 (노출 토큰, 뷰어 세션)에서 서버가 계산한다.
  // 클라이언트 eventId 는 무시 — 같은 토큰을 새 eventId 로 반복 전송해도 1건. sessionSeed 가 없으면 토큰 자체로 대체.
  const sessionSeed =
    String(body.sessionSeed ?? "").trim() || `token:${deliveryAdExposureTokenHash(exposureToken)}`;
  const viewerSessionHash = hashDeliveryAdViewerSession(sessionSeed);
  const eventId = deriveDeliveryAdClickEventId(exposureToken, viewerSessionHash);
  const impressionEventIdRaw = body.impressionEventId == null ? "" : String(body.impressionEventId).trim();

  const result = await recordDeliveryAdClickFromToken(sb, {
    exposureToken,
    eventId,
    viewerSessionHash,
    impressionEventId: UUID_RE.test(impressionEventIdRaw) ? impressionEventIdRaw : null,
    buyerUserId,
    // 서버 시각만 사용 — 클라이언트 occurredAt 은 무시 (과거·미래 시각 주입 차단).
    occurredAtIso: new Date().toISOString(),
    claimedDestinationType:
      body.destinationType == null ? null : String(body.destinationType),
    claimedDestinationId: body.destinationId == null ? null : String(body.destinationId),
  });

  if (!result.ok) {
    const status =
      result.error === "expired"
        ? 410
        : result.error === "preview_forbidden" ||
            result.error === "invalid_destination" ||
            result.error === "tampered_fields"
          ? 403
          : 400;
    if (result.detail) {
      console.error("[/api/stores/ads/click POST]", result.error, result.detail);
    }
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, eventId, deduped: result.deduped, id: result.id });
}
