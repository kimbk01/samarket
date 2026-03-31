import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ensureLocationId } from "@/lib/neighborhood/ensure-location";
import { coalesceNeighborhoodLocationInput } from "@/lib/neighborhood/coalesce-location-input";
import { isPhilifeNeighborhoodFeedFilterSlugAllowed, loadPhilifeDefaultSectionTopics } from "@/lib/neighborhood/philife-neighborhood-topics";
import { listNeighborhoodFeed } from "@/lib/neighborhood/queries";

export async function GET(req: NextRequest) {
  const locationKey = req.nextUrl.searchParams.get("locationKey")?.trim() ?? "";
  const city = req.nextUrl.searchParams.get("city")?.trim() ?? "";
  const district = req.nextUrl.searchParams.get("district")?.trim() ?? "";
  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  const categoryRaw = req.nextUrl.searchParams.get("category")?.trim() ?? "";
  const authorIdRaw = req.nextUrl.searchParams.get("authorId")?.trim() ?? "";
  const offsetRaw = req.nextUrl.searchParams.get("offset")?.trim() ?? "0";
  const limitRaw = req.nextUrl.searchParams.get("limit")?.trim() ?? "";
  const neighborOnly = req.nextUrl.searchParams.get("neighborOnly") === "1";

  if (!locationKey) {
    return NextResponse.json({ ok: false, error: "locationKey_required" }, { status: 400 });
  }

  const viewerUserId = await getOptionalAuthenticatedUserId();

  if (neighborOnly && !viewerUserId) {
    return NextResponse.json({ ok: false, error: "neighbor_only_requires_login" }, { status: 401 });
  }

  const authorId = authorIdRaw || null;
  if (authorId && (!viewerUserId || viewerUserId !== authorId)) {
    return NextResponse.json({ ok: false, error: "author_filter_requires_self" }, { status: 403 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const locationId = await ensureLocationId(
    sb,
    locationKey,
    coalesceNeighborhoodLocationInput(locationKey, { city, district, name })
  );

  if (!locationId) {
    return NextResponse.json({
      ok: true,
      locationId: null,
      posts: [],
      hasMore: false,
      nextOffset: null,
      dbPageLength: 0,
    });
  }

  let category: string | null = null;
  if (categoryRaw) {
    const s = categoryRaw.trim().toLowerCase();
    const allowed = await isPhilifeNeighborhoodFeedFilterSlugAllowed(s);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "invalid_category" }, { status: 400 });
    }
    category = s;
  }
  const offset = Math.min(Math.max(parseInt(offsetRaw, 10) || 0, 0), 500);
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 40);

  const topics = await loadPhilifeDefaultSectionTopics();

  const { posts, hasMore, dbScannedCount } = await listNeighborhoodFeed({
    locationId,
    category: category ?? undefined,
    authorUserId: authorId,
    offset,
    limit,
    viewerUserId,
    neighborOnly,
    topics,
  });

  return NextResponse.json({
    ok: true,
    locationId,
    posts,
    hasMore,
    nextOffset: hasMore ? offset + dbScannedCount : null,
    /** 필터 전 DB 행 수 — 클라 offset 계산용(`posts.length`와 다를 수 있음) */
    dbPageLength: dbScannedCount,
  });
}
