import { NextResponse } from "next/server";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { getLiveStatus } from "@/lib/intro/live/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Device Live pointer + pack retrieval.
 * Public to native cold delivery (pack itself is signed URL).
 */
export async function GET() {
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const live = await getLiveStatus(sb);
    if (live.kind === "NO_LIVE") {
      return NextResponse.json({ ok: true as const, kind: "NO_LIVE" as const });
    }
    return NextResponse.json({
      ok: true as const,
      kind: "LIVE" as const,
      releaseId: live.releaseId,
      packageId: live.packageId,
      packageIntegrity: live.packageIntegrity,
      packRetrievalUrl: live.packRetrievalUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "live_failed" },
      { status: 500 },
    );
  }
}
