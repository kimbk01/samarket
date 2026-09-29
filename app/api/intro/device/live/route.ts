import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { buildDeviceLivePayload } from "@/lib/intro/live";
import { ServerLiveStatus } from "@/lib/intro/contracts/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/intro/device/live
 *
 * Canonical device Live endpoint.
 * App session required — not Admin API.
 * Returns temporary retrieval capability when COMMITTED_LIVE.
 * NEVER_CONFIGURED and NO_LIVE_INTRO both map to kind=NO_LIVE_INTRO
 * but physicalLiveKind is preserved.
 */
export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthorized",
        kind: ServerLiveStatus.FETCH_FAILURE,
      },
      { status: 401 },
    );
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_misconfigured",
        kind: ServerLiveStatus.FETCH_FAILURE,
      },
      { status: 503 },
    );
  }

  try {
    const live = await buildDeviceLivePayload(sb);
    return NextResponse.json({
      ok: true as const,
      ...live,
      // Historical Intro tables are quarantine — never returned.
      historicalIntro: "QUARANTINED",
      mediaLibraryAuthority: false,
      draftAuthority: false,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "device_live_failed",
        kind: ServerLiveStatus.FETCH_FAILURE,
        message: err instanceof Error ? err.message : "device_live_failed",
      },
      { status: 500 },
    );
  }
}
