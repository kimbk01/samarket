import { NextRequest, NextResponse } from "next/server";
import { loadOsEntryLane } from "@/lib/os-entry/db";
import { isOsEntryBundleComplete } from "@/lib/os-entry/normalize";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public LIVE read for warm sync only.
 * Cold OsEntryOwner must NOT call this.
 */
export async function GET(req: NextRequest) {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const live = await loadOsEntryLane(sb, "live");
  if (!live.ok) {
    if (live.reason === "missing_table") {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: live.message ?? "error" }, { status: 500 });
  }

  const metaOnly = req.nextUrl.searchParams.get("meta") === "1";
  if (metaOnly) {
    return NextResponse.json({
      ok: true as const,
      revision: live.config.revision,
    });
  }

  if (live.config.revision > 0 && !isOsEntryBundleComplete(live.config)) {
    return NextResponse.json({ ok: false, error: "incomplete_live" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true as const,
    config: live.config,
    revision: live.config.revision,
  });
}
