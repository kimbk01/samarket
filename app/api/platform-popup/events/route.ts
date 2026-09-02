import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { canEmitPlatformPopupEventFromSource } from "@/lib/platform-popup/events";
import type { PlatformPopupEventType } from "@/lib/platform-popup/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

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

  const { error } = await sb.from("platform_popup_campaign_events").insert({
    campaign_id: campaignId,
    creative_id: body.creativeId?.trim() || null,
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
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventType });
}
