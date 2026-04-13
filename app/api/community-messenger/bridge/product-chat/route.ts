import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { buildCommunityMessengerRoomUrlWithContext } from "@/lib/community-messenger/cm-ctx-url";
import { buildMessengerContextMetaFromProductChatSnapshot } from "@/lib/community-messenger/product-chat-messenger-meta";
import { resolveProductChat } from "@/lib/trade/resolve-product-chat";
import {
  ensureCommunityMessengerDirectRoomFromProductChat,
  updateCommunityMessengerRoomContextMeta,
} from "@/lib/community-messenger/service";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

function firstPostThumbnail(images: unknown): string | null {
  if (images == null) return null;
  if (Array.isArray(images) && images.length > 0) {
    const x = images[0];
    if (typeof x === "string" && x.trim()) return x.trim();
    if (x && typeof x === "object" && "url" in x && typeof (x as { url?: unknown }).url === "string") {
      return String((x as { url: string }).url).trim() || null;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rl = await enforceRateLimit({
    key: `community-messenger:bridge-product-chat:${getRateLimitKey(req, auth.userId)}`,
    limit: 12,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_bridge_product_chat_rate_limited",
  });
  if (!rl.ok) return rl.response;

  const parsed = await parseJsonBody<{ roomId?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const roomIdInput = String(parsed.value.roomId ?? "").trim();
  if (!roomIdInput) return jsonError("roomId가 필요합니다.", 400, { code: "bad_request" });

  let sb: ReturnType<typeof getSupabaseServer> | null = null;
  try {
    sb = getSupabaseServer();
  } catch {
    sb = null;
  }
  if (!sb) return jsonError("서버 설정이 필요합니다.", 500);

  const ensured = await ensureCommunityMessengerDirectRoomFromProductChat(auth.userId, roomIdInput);
  if (!ensured.ok || !ensured.roomId) {
    const err = ensured.error ?? "bridge_failed";
    const status = err === "not_participant" ? 403 : err === "product_chat_not_found" ? 404 : 400;
    return jsonError(
      err === "product_chat_not_found" ? "거래 채팅을 찾을 수 없습니다." : "메신저 방을 준비하지 못했습니다.",
      { status, code: err }
    );
  }

  const resolved = await resolveProductChat(sb as never, roomIdInput);
  if (!resolved) {
    return jsonOk({
      roomId: ensured.roomId,
      href: buildCommunityMessengerRoomUrlWithContext(ensured.roomId, {
        v: 1,
        kind: "trade",
        headline: "거래",
      }),
    });
  }

  const pc = resolved.productChat;
  const postId = String(pc.post_id ?? "").trim();
  const { data: post } = await sb
    .from(POSTS_TABLE_READ)
    .select("title, price, currency, images")
    .eq("id", postId)
    .maybeSingle();

  const title = typeof post?.title === "string" ? post.title.trim() : "";
  const priceRaw = post?.price;
  const price =
    typeof priceRaw === "number" && Number.isFinite(priceRaw)
      ? priceRaw
      : priceRaw != null
        ? Number(priceRaw)
        : null;
  const currency = typeof post?.currency === "string" && post.currency.trim() ? post.currency.trim() : "PHP";

  const meta = buildMessengerContextMetaFromProductChatSnapshot({
    productChatId: resolved.productChatId,
    productTitle: title || "거래",
    price: price != null && !Number.isNaN(price) ? price : null,
    currency,
    tradeFlowStatus: String((pc as { trade_flow_status?: string }).trade_flow_status ?? "chatting"),
    thumbnailUrl: firstPostThumbnail(post?.images),
  });

  await updateCommunityMessengerRoomContextMeta({
    userId: auth.userId,
    roomId: ensured.roomId,
    contextMeta: meta,
  });

  const href = buildCommunityMessengerRoomUrlWithContext(ensured.roomId, meta);
  return jsonOk({ roomId: ensured.roomId, href });
}
