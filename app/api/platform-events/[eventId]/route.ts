import { NextRequest, NextResponse } from "next/server";
import { loadPlatformEventByIdAdmin } from "@/lib/platform-events/load-event";
import {
  platformEventUnavailableFallback,
  resolvePlatformEventPublicView,
} from "@/lib/platform-events/publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ eventId: string }> };

/**
 * GET /api/platform-events/[eventId]
 * Public Event Detail payload — `resolvePlatformEventPublicView` is the contract (EVT-02):
 * active → 200, ended → 200 with `ended: true` (never "Gone"), not started / missing → 404,
 * draft / unpublished / archived → 403.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { eventId } = await ctx.params;
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "ko";
  const row = await loadPlatformEventByIdAdmin(eventId);
  const view = resolvePlatformEventPublicView(row);
  if (view.kind !== "view" || !row) {
    const availability = view.kind === "view" ? "missing" : view.availability;
    return NextResponse.json(
      {
        ok: false,
        availability,
        error: view.kind === "forbidden" ? "unavailable" : "not_found",
        fallback: platformEventUnavailableFallback(availability, lang),
      },
      { status: view.kind === "forbidden" ? 403 : 404 }
    );
  }
  return NextResponse.json({
    ok: true,
    availability: view.availability,
    ended: view.ended,
    event: row,
  });
}
