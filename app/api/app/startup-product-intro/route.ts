import { NextResponse } from "next/server";
import { BUNDLED_PRODUCT_INTRO_CONFIG } from "@/lib/startup/product-intro";
import { loadProductIntroFromDb } from "@/lib/startup/product-intro-db";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public Product Intro — no auth. Used after shellReady for next-entry cache only. */
export async function GET() {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(
      { ok: true as const, source: "default" as const, config: BUNDLED_PRODUCT_INTRO_CONFIG },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
    );
  }

  const loaded = await loadProductIntroFromDb(sb);
  if (!loaded.ok) {
    return NextResponse.json(
      { ok: true as const, source: "default" as const, config: BUNDLED_PRODUCT_INTRO_CONFIG },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
    );
  }

  return NextResponse.json(
    { ok: true as const, source: loaded.source, config: loaded.config },
    { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
  );
}
