import { NextResponse } from "next/server";
import { BUNDLED_STARTUP_CONFIG } from "@/lib/startup/startup-config";
import { loadStartupConfigFromDb } from "@/lib/startup/startup-config-db";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public startup config — no auth. Used after first paint for next-launch cache. */
export async function GET() {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(
      { ok: true as const, source: "default" as const, config: BUNDLED_STARTUP_CONFIG },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
    );
  }

  const loaded = await loadStartupConfigFromDb(sb);
  if (!loaded.ok) {
    return NextResponse.json(
      { ok: true as const, source: "default" as const, config: BUNDLED_STARTUP_CONFIG },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
    );
  }

  return NextResponse.json(
    { ok: true as const, source: loaded.source, config: loaded.config },
    { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
  );
}
