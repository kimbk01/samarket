import { NextResponse } from "next/server";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { getSystemStartLiveStatus } from "@/lib/intro/system-start/live-apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Device fetch — Layer B Live System Start generation. */
export async function GET() {
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const live = await getSystemStartLiveStatus(sb);
    if (live.kind === "NO_LIVE") {
      return NextResponse.json({ ok: true as const, kind: "NO_LIVE" as const });
    }
    return NextResponse.json({
      ok: true as const,
      kind: "LIVE" as const,
      generationId: live.generationId,
      revision: live.revision,
      packageIntegrity: live.packageIntegrity,
      configRetrievalUrl: live.configRetrievalUrl,
      assetRetrievalUrls: live.assetRetrievalUrls,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "ss_live_failed" },
      { status: 500 },
    );
  }
}
