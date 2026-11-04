import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import {
  deliveryAdExposureTokenHash,
  deriveDeliveryAdImpressionEventId,
  hashDeliveryAdViewerSession,
} from "@/lib/stores/advertising/delivery-ad-exposure-token";
import { recordDeliveryAdImpressionFromToken } from "@/lib/stores/advertising/delivery-ad-event-writer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getClientIp } from "@/lib/http/api-route";
import { adEventRecordActorKey, enforceAdEventRecordQuota } from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  // D-21 ③: 요청 제한(회원 id · 없으면 IP 해시). 넘으면 429 — 앱 쪽 `useDeliveryAdEvents` 는 실패를 무시한다(화면 영향 없음).
  const viewerUserId = await getOptionalAuthenticatedUserId();
  const quota = await enforceAdEventRecordQuota(
    "delivery_ad_impression",
    adEventRecordActorKey({ userId: viewerUserId, ip: getClientIp(req) })
  );
  if (!quota.ok) return quota.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const exposureToken = String(body.exposureToken ?? "");
  // ADS-10 — the dedupe key is computed on the server from (exposure token, viewer session); the client eventId
  // is auxiliary only (kept in context_json) so re-posting the same token with new eventIds counts once.
  // A missing sessionSeed falls back to the token itself (not to a fresh random id).
  const clientEventId = String(body.eventId ?? "").trim().slice(0, 128) || null;
  const sessionSeed =
    String(body.sessionSeed ?? "").trim() || `token:${deliveryAdExposureTokenHash(exposureToken)}`;
  const viewerSessionHash = hashDeliveryAdViewerSession(sessionSeed);
  const eventId = deriveDeliveryAdImpressionEventId(exposureToken, viewerSessionHash);

  const result = await recordDeliveryAdImpressionFromToken(sb, {
    exposureToken,
    eventId,
    viewerSessionHash,
    occurredAtIso: body.occurredAt == null ? undefined : String(body.occurredAt),
    requestId: body.requestId == null ? null : String(body.requestId),
    clientEventId,
    claimed: {
      campaignId: body.campaignId == null ? undefined : String(body.campaignId),
      storeId: body.storeId == null ? undefined : String(body.storeId),
      inventoryId: body.inventoryId == null ? undefined : String(body.inventoryId),
      productKind: body.productKind == null ? undefined : String(body.productKind),
    },
  });

  if (!result.ok) {
    const status =
      result.error === "expired"
        ? 410
        : result.error === "preview_forbidden" || result.error === "tampered_fields"
          ? 403
          : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  // Optional auth does not change impression privacy fields (회원 id 는 요청 제한 키에만 쓴다).
  return NextResponse.json({ ok: true, eventId, deduped: result.deduped, id: result.id });
}
