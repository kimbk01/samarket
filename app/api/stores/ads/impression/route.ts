import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import {
  hashDeliveryAdViewerSession,
  newDeliveryAdEventId,
} from "@/lib/stores/advertising/delivery-ad-exposure-token";
import { recordDeliveryAdImpressionFromToken } from "@/lib/stores/advertising/delivery-ad-event-writer";
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

  const result = await recordDeliveryAdImpressionFromToken(sb, {
    exposureToken,
    eventId,
    viewerSessionHash,
    occurredAtIso: body.occurredAt == null ? undefined : String(body.occurredAt),
    requestId: body.requestId == null ? null : String(body.requestId),
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

  // Optional auth does not change impression privacy fields.
  void (await getOptionalAuthenticatedUserId());

  return NextResponse.json({ ok: true, eventId, deduped: result.deduped, id: result.id });
}
