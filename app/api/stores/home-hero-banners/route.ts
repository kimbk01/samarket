import { NextResponse } from "next/server";
import { loadVisibleStoresHomeHeroBanners } from "@/lib/stores/load-store-banner-ad-campaigns";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CUT 5 — public HOME hero banner slides (ONE Banner authority).
 * Empty list = hide hero (no static/fake campaign fallback).
 */
export async function GET() {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json(
      { ok: true, banners: [] as const, meta: { source: "supabase_unconfigured" as const } },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const banners = await loadVisibleStoresHomeHeroBanners(sb).catch(() => []);
  return NextResponse.json(
    {
      ok: true,
      banners,
      meta: {
        surface: "stores_home_hero" as const,
        authority: "store_banner_ad_campaigns" as const,
        count: banners.length,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
