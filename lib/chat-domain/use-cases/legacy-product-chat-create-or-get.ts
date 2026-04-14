import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { fetchPostRowForTradeChatById } from "@/lib/posts/fetch-post-row-for-trade-chat";
import { ensureMessengerRoomIdForProductChat } from "@/lib/trade/ensure-messenger-room-for-trade-chat";

export type ResolveLegacyProductChatResult =
  | { ok: true; roomId: string; messengerRoomId?: string }
  | { ok: false; error: string; status: number };

export async function resolveLegacyProductChatCreateOrGet(input: {
  userId: string;
  productId: string;
}): Promise<ResolveLegacyProductChatResult> {
  const userId = input.userId.trim();
  const productId = input.productId.trim();

  if (!userId) {
    return { ok: false, error: "로그인이 필요합니다.", status: 401 };
  }
  if (!productId) {
    return { ok: false, error: "productId 필요", status: 400 };
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return {
      ok: false,
      error: "서버 설정이 필요합니다. .env.local에 SUPABASE_SERVICE_ROLE_KEY를 넣어 주세요.",
      status: 500,
    };
  }
  const sbAny: SupabaseClient<any> = svc as SupabaseClient<any>;
  const access = await assertVerifiedMemberForAction(sbAny, userId);
  if (!access.ok) {
    return { ok: false, error: access.error, status: access.status };
  }

  // 1) 상품 및 판매자 — 상세 API와 동일 로더
  const postRaw = await fetchPostRowForTradeChatById(sbAny, productId);
  if (!postRaw) {
    return { ok: false, error: "상품을 찾을 수 없습니다.", status: 404 };
  }
  const row = postRaw as Record<string, unknown>;
  const sellerId = postAuthorUserId(row) ?? "";
  if (!sellerId) {
    return { ok: false, error: "상품을 찾을 수 없습니다.", status: 404 };
  }
  if (sellerId === userId) {
    return { ok: false, error: "내 상품에는 채팅할 수 없습니다.", status: 400 };
  }
  if (row.is_deleted === true) {
    return { ok: false, error: "삭제된 상품입니다.", status: 400 };
  }
  if (row.status === "hidden" || row.visibility === "hidden") {
    return { ok: false, error: "비공개 상품입니다.", status: 400 };
  }
  if (row.status === "sold") {
    return { ok: false, error: "거래완료된 상품입니다.", status: 400 };
  }

  // 2) 차단
  const [block1Res, block2Res] = await Promise.all([
    sbAny.from("user_blocks").select("id").eq("user_id", userId).eq("blocked_user_id", sellerId).maybeSingle(),
    sbAny.from("user_blocks").select("id").eq("user_id", sellerId).eq("blocked_user_id", userId).maybeSingle(),
  ]);
  if (block1Res.data || block2Res.data) {
    return { ok: false, error: "차단 관계에서는 채팅할 수 없습니다.", status: 403 };
  }

  // 3) 기존 방
  const { data: existing } = await sbAny
    .from("product_chats")
    .select("id")
    .eq("post_id", productId)
    .eq("seller_id", sellerId)
    .eq("buyer_id", userId)
    .maybeSingle();
  const existingRow = existing as { id?: string } | null;
  if (existingRow?.id) {
    const messengerRoomId = await ensureMessengerRoomIdForProductChat(userId, existingRow.id);
    return { ok: true, roomId: existingRow.id, messengerRoomId };
  }

  // 4) 새 방 생성
  const { data: inserted, error: insertErr } = await sbAny
    .from("product_chats")
    .insert({
      post_id: productId,
      seller_id: sellerId,
      buyer_id: userId,
    })
    .select("id")
    .single();

  if (insertErr) {
    return {
      ok: false,
      error: insertErr.message ?? "채팅방 생성에 실패했습니다.",
      status: 500,
    };
  }
  const ins = inserted as { id?: string } | null | undefined;
  const roomId = ins?.id ?? "";
  const messengerRoomId = roomId ? await ensureMessengerRoomIdForProductChat(userId, roomId) : undefined;
  if (!roomId) {
    return { ok: false, error: "채팅방 생성에 실패했습니다.", status: 500 };
  }
  return { ok: true, roomId, messengerRoomId };
}
