import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchPostAdsForUserFromDb } from "@/lib/ads/post-ads-supabase";
import type { MePostAdsMeta } from "@/lib/ads/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/post-ads
 * 로그인 사용자의 게시글 광고 목록
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient() ?? (await createSupabaseRouteHandlerClient());
  if (!sb) {
    return NextResponse.json({
      ok: true,
      ads: [],
      meta: { source: "unavailable" } satisfies MePostAdsMeta,
    });
  }

  const db = await fetchPostAdsForUserFromDb(sb, auth.userId);
  if (db.ok) {
    return NextResponse.json({
      ok: true,
      ads: db.rows,
      meta: { source: "supabase" } satisfies MePostAdsMeta,
    });
  }
  if (db.reason === "missing_table") {
    return NextResponse.json({
      ok: true,
      ads: [],
      meta: { source: "missing_table" } satisfies MePostAdsMeta,
    });
  }
  if (db.message) {
    console.warn("[api/me/post-ads] db:", db.message);
  }

  return NextResponse.json({
    ok: true,
    ads: [],
    meta: { source: "unavailable" } satisfies MePostAdsMeta,
  });
}
