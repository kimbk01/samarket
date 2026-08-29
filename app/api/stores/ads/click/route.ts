import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import {
  hashDeliveryAdViewerSession,
  newDeliveryAdEventId,
} from "@/lib/stores/advertising/delivery-ad-exposure-token";
import { recordDeliveryAdClickFromToken } from "@/lib/stores/advertising/delivery-ad-event-writer";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const exposureToken = String(body.exposureToken ?? "");
  const eventId = String(body.eventId ?? "").trim() || newDeliveryAdEventId();
  const sessionSeed = String(body.sessionSeed ?? "").trim() || eventId;
  const viewerSessionHash = hashDeliveryAdViewerSession(sessionSeed);
  const buyerUserId = await getOptionalAuthenticatedUserId();

  const result = await recordDeliveryAdClickFromToken(sb, {
    exposureToken,
    eventId,
    viewerSessionHash,
    impressionEventId: body.impressionEventId == null ? null : String(body.impressionEventId),
    buyerUserId,
    occurredAtIso: body.occurredAt == null ? undefined : String(body.occurredAt),
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
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, eventId, deduped: result.deduped, id: result.id });
}
