import { NextRequest, NextResponse } from "next/server";
import {
  clampPlatformEventBoardLimit,
  paginatePlatformEventBoard,
  parsePlatformEventBoardState,
} from "@/lib/platform-events/board";
import { listPlatformEventBoardCandidates } from "@/lib/platform-events/load-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform-events?state=ongoing|ended&cursor=&limit=
 * Public Event board list (EVT-01). Published + started + not archived only;
 * ended = ended within the last 30 days. Keyset cursor (`nextCursor`).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const state = parsePlatformEventBoardState(sp.get("state"));
  const limit = clampPlatformEventBoardLimit(sp.get("limit"));
  const cursor = sp.get("cursor");
  const nowMs = Date.now();
  const res = await listPlatformEventBoardCandidates(state, nowMs);
  if (!res.ok) {
    const status = res.error === "supabase_unconfigured" ? 503 : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  const page = paginatePlatformEventBoard(res.rows, { state, cursor, limit, nowMs });
  return NextResponse.json(
    { ok: true, state, items: page.items, nextCursor: page.nextCursor },
    { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } }
  );
}
