/**
 * GET /api/favorites/status — 여러 게시글에 대한 현재 사용자 찜 여부
 * Query: postIds (쉼표 구분) — 사용자는 세션
 * 응답: { [postId]: boolean }
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const postIdsParam = searchParams.get("postIds")?.trim() ?? "";

  const postIds = postIdsParam
    ? [...new Set(postIdsParam.split(",").map((s) => s.trim()).filter(Boolean))]
    : [];

  const empty = Object.fromEntries(postIds.map((id) => [id, false]));

  if (postIds.length === 0) {
    return NextResponse.json(empty);
  }

  const { getOptionalAuthenticatedUserId } = await import("@/lib/auth/get-optional-authenticated-user-id");
  const userId = (await getOptionalAuthenticatedUserId()) ?? "";

  if (!userId) {
    return NextResponse.json(empty);
  }

  try {
    const { getSupabaseServer } = await import("@/lib/chat/supabase-server");
    const sbAny = getSupabaseServer();

    const { data, error } = await sbAny
      .from("favorites")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", postIds);

    if (error) return NextResponse.json(empty);

    const set = new Set((data ?? []).map((r: { post_id: string }) => r.post_id));
    return NextResponse.json(
      Object.fromEntries(postIds.map((id) => [id, set.has(id)]))
    );
  } catch {
    return NextResponse.json(empty);
  }
}
