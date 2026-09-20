import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { recordPromotionContentVisit } from "@/lib/platform-promotion-lifecycle/record-content-visit";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform-promotion/content-visit
 * Records promotion-origin Event DESTINATION_OPEN for same-Event popup coordination.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    eventId?: string;
    sourceChannel?: string;
    sessionKey?: string;
    deviceKey?: string | null;
    distributionId?: string | null;
  };

  const userId = await getOptionalAuthenticatedUserId();
  const result = await recordPromotionContentVisit(sb, {
    eventId: body.eventId ?? "",
    sourceChannel: body.sourceChannel ?? "",
    sessionKey: body.sessionKey ?? "",
    userId,
    anonymousDeviceKey: userId ? null : body.deviceKey,
    distributionId: body.distributionId,
  });

  if (!result.ok) {
    const status =
      result.error === "missing_actor" ||
      result.error === "missing_event_id" ||
      result.error === "missing_session_key" ||
      result.error === "invalid_source_channel"
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
