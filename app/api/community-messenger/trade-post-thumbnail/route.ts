import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { extractPostThumbnailPathFromPostRow } from "@/lib/community-messenger/trade-chat-list/post-thumbnail-path";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { resolvePostImagePublicUrl } from "@/lib/posts/resolve-post-image-public-url";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 거래 채팅 목록 — 클라에서 `contextMeta.thumbnailUrl` 이 비어 있을 때 `postId` 만으로
 * 서버 환경변수로 공개 스토리지 URL 을 확정한다 (브라우저 쪽 NEXT_PUBLIC 누락·경로만 저장된 경우 보완).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:trade-post-thumb:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "썸네일 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_trade_post_thumb_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const postId = req.nextUrl.searchParams.get("postId")?.trim() ?? "";
  if (!postId) {
    return NextResponse.json({ ok: false, error: "postId_required" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: post, error } = await sb
    .from(POSTS_TABLE_READ)
    .select("id, images, thumbnail_url")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ ok: true, url: null });
  }

  const rawPath = extractPostThumbnailPathFromPostRow(post as Record<string, unknown>);
  const url = rawPath ? resolvePostImagePublicUrl(rawPath).trim() : "";
  return NextResponse.json({ ok: true, url: url.length > 0 ? url : null });
}
