import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import {
  computePlatformPopupSuppressUntil,
} from "@/lib/platform-popup/suppression";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";
import { PLATFORM_POPUP_DEFAULT_TIMEZONE } from "@/lib/platform-popup/types";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

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

  const timezone = body.timezone?.trim() || PLATFORM_POPUP_DEFAULT_TIMEZONE;
  const now = new Date();
  const suppressUntil =
    mode === "CLOSE"
      ? null
      : computePlatformPopupSuppressUntil(mode, {
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
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mode,
    suppressUntil: suppressUntil ? suppressUntil.toISOString() : null,
  });
}
