import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { getLiveAuthority, resolveCommittedRevisionAuthority } from "@/lib/intro/live";
import { AppIntroLiveKind } from "@/lib/intro/db/authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/intro/live
 * Admin Live status — distinguishes PUBLISHED vs CURRENT LIVE.
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 503 },
    );
  }

  try {
    const live = await getLiveAuthority(sb);
    let authority = null;
    if (
      live.liveKind === AppIntroLiveKind.COMMITTED_LIVE &&
      live.publishedRevisionId
    ) {
      authority = await resolveCommittedRevisionAuthority(
        sb,
        live.publishedRevisionId,
      );
    }
    return NextResponse.json({
      ok: true as const,
      live,
      authority,
      labels: {
        published: "PUBLISHED",
        currentLive:
          live.liveKind === AppIntroLiveKind.COMMITTED_LIVE
            ? "CURRENT_LIVE"
            : live.liveKind,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "live_read_failed",
        message: err instanceof Error ? err.message : "live_read_failed",
      },
      { status: 500 },
    );
  }
}
