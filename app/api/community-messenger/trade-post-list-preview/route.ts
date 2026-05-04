import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tradePostHeadlineForMessengerList } from "@/lib/community-messenger/trade-chat-list/trade-post-row-fields";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { formatPrice } from "@/lib/utils/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 거래 채팅 목록 2행 — `contextMeta.headline` 이 비거나 "거래" 일 때 `postId` 로
 * `posts` 에서 제목·가격 문자열을 확정한다 (목록 전용, 썸네일 API와 분리).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:trade-post-list-preview:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_trade_post_list_preview_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const postId = req.nextUrl.searchParams.get("postId")?.trim() ?? "";
  if (!postId) {
    return NextResponse.json({ ok: false, error: "post_id_required" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: post, error } = await sb
    .from(POSTS_TABLE_READ)
    .select("id, title, price, currency, meta")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const row = post as Record<string, unknown>;
  const title = tradePostHeadlineForMessengerList(row) || "거래";
  const priceRaw = row.price;
  const price =
    typeof priceRaw === "number" && Number.isFinite(priceRaw)
      ? priceRaw
      : priceRaw != null
        ? Number(priceRaw)
        : null;
  const currency = typeof row.currency === "string" && row.currency.trim() ? row.currency.trim() : "PHP";
  const priceLabel =
    price != null && Number.isFinite(price) && !Number.isNaN(price) && price >= 0 ? formatPrice(price, currency) : null;

  return NextResponse.json({ ok: true, title, priceLabel });
}
