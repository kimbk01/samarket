import { NextResponse } from "next/server";
import { DEFAULT_COLD_BOOT_INTRO_CONFIG } from "@/lib/app-boot/cold-boot-intro-config";
import { loadColdBootIntroConfigFromDb } from "@/lib/app-boot/cold-boot-intro-db";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public cold-boot intro config — no auth. Used after first paint for next-launch cache. */
export async function GET() {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(
      { ok: true as const, source: "default" as const, config: DEFAULT_COLD_BOOT_INTRO_CONFIG },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
    );
  }

  const loaded = await loadColdBootIntroConfigFromDb(sb);
  if (!loaded.ok) {
    return NextResponse.json(
      { ok: true as const, source: "default" as const, config: DEFAULT_COLD_BOOT_INTRO_CONFIG },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
    );
  }

  return NextResponse.json(
    { ok: true as const, source: loaded.source, config: loaded.config },
    { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
  );
}
