import { NextRequest, NextResponse } from "next/server";
import { loadPlatformEventByIdAdmin } from "@/lib/platform-events/load-event";
import {
  platformEventUnavailableFallback,
  resolvePlatformEventAvailability,
} from "@/lib/platform-events/publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ eventId: string }> };

/**
 * GET /api/platform-events/[eventId]
 * Public Event Detail payload — publication-gated.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { eventId } = await ctx.params;
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "ko";
  const row = await loadPlatformEventByIdAdmin(eventId);
  const availability = resolvePlatformEventAvailability(row);
  if (availability !== "active" || !row) {
    const fb = platformEventUnavailableFallback(availability, lang);
    return NextResponse.json(
      {
        ok: false,
        availability,
        error: availability === "missing" ? "not_found" : "unavailable",
        fallback: fb,
      },
      { status: availability === "missing" ? 404 : 410 }
    );
  }
  return NextResponse.json({ ok: true, availability: "active", event: row });
}
