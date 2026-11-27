import { NextRequest, NextResponse } from "next/server";
import { internalErrorResponse } from "@/lib/security/internal-error-response";
import { loadActiveEventHeroBanners } from "@/lib/platform-promotion-distribution/load-active-event-hero-banners";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/platform-events/hero-banners?placement=TRADE_HOME */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, items: [] as const, reason: "service_unavailable" });
  }
  const placementRaw = new URL(req.url).searchParams.get("placement") ?? "TRADE_HOME";
  const placement =
    placementRaw.toUpperCase() === "COMMUNITY_HOME" ? "COMMUNITY_HOME" : "TRADE_HOME";
  try {
    const items = await loadActiveEventHeroBanners(sb, { placement });
    return NextResponse.json({
      ok: true,
      items,
      presentation: "HERO_BANNER",
      paidSideEffect: 0,
    });
  } catch (e) {
    return internalErrorResponse("load_failed", "[platform-events/hero-banners]", e);
  }
}
