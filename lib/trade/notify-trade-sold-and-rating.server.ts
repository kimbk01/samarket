/**
 * 감사 P3 (Owner 2026-11-22 「권장안대로 진행」 · 설계 `docs/audit/trade-r4-p3-design-2026-11-22.md`).
 *
 * - ① 판매완료 → 그 글로 대화한 상대 중 **거래 평가 자격(E1~E7)이 되는 사람**에게만 알린다.
 *   「평가를 남겨 주세요」 알림을 받고도 평가할 수 없는 일이 없게 하려는 것이다.
 * - ③ 거래 평가 저장 → 상대가 아직 평가하지 않았을 때(공개 전) 받은 사람에게 알린다. 평가 내용은 넣지 않는다.
 *
 * 기존 거래 알림 종류(`trade_status`, push_kind `trade` — 거래 알림 설정·채널·벨 규칙)와
 * 발송 함수(`appendUserNotification`)를 그대로 쓴다. 알림 잠금 문서의 계약은 바꾸지 않는다.
 * 실패해도 본 요청(판매완료·평가 저장)은 실패시키지 않는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { tradeChatNotificationHref } from "@/lib/chats/trade-chat-notification-href";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { notificationCopyMeta } from "@/lib/notifications/notification-stored-copy";
import { loadTradeRatingContext } from "@/lib/trade/trade-rating";

/** 판매완료 1건당 확인할 방 상한 — 요청 수를 묶는다(방마다 자격 확인 조회가 있다) */
export const TRADE_SOLD_NOTIFY_MAX_ROOMS = 20;

const TITLE_SNIPPET_MAX = 40;

type Sb = SupabaseClient<any>;

function snippet(title: string | null | undefined): string {
  const t = String(title ?? "").trim();
  return t.length > TITLE_SNIPPET_MAX ? `${t.slice(0, TITLE_SNIPPET_MAX)}…` : t;
}

type SoldRoomRow = {
  id: string;
  seller_id: string;
  buyer_id: string;
  community_messenger_room_id: string | null;
};

/** ① 판매완료 알림. 보낸 사람 수를 돌려준다. */
export async function notifyTradeSoldToEligibleCounterparts(
  sb: Sb,
  args: { postId: string; sellerUserId: string; postTitle: string | null; now?: Date }
): Promise<number> {
  const postId = args.postId.trim();
  if (!postId) return 0;
  const { data, error } = await sb
    .from("product_chats")
    .select("id, seller_id, buyer_id, community_messenger_room_id")
    .eq("post_id", postId)
    .limit(TRADE_SOLD_NOTIFY_MAX_ROOMS);
  if (error || !data) return 0;

  const now = args.now ?? new Date();
  let sent = 0;
  for (const raw of data as SoldRoomRow[]) {
    const buyerId = String(raw.buyer_id ?? "").trim();
    const cmRoomId = String(raw.community_messenger_room_id ?? "").trim();
    if (!buyerId || buyerId === args.sellerUserId || !cmRoomId) continue;
    try {
      const ctx = await loadTradeRatingContext(sb, raw.id, buyerId, now);
      /** 차단·계정 정지·같은 기기·대화 부족·이미 평가함 등은 자격 판정이 걸러 낸다 */
      if (!ctx?.eligibility.eligible) continue;
      const lang = await loadNotificationUserLanguage(sb, buyerId);
      const product = snippet(args.postTitle) || notifySafeT(lang, "notify_trade_product_fallback");
      await appendUserNotification(sb, {
        user_id: buyerId,
        notification_type: "status",
        title: notifySafeT(lang, "notify_trade_sold_rate_title"),
        body: notifySafeT(lang, "notify_trade_sold_rate_body", { vars: { product } }),
        link_url: tradeChatNotificationHref(cmRoomId, "product_chat"),
        domain: "trade_chat",
        ref_id: cmRoomId,
        sender_id: args.sellerUserId,
        dedupe_key: `trade-sold:${postId}:${buyerId}`,
        push_kind: "trade",
        meta: {
          kind: "trade_sold",
          room_id: cmRoomId,
          product_chat_id: raw.id,
          product_id: postId,
          actor_id: args.sellerUserId,
          ...notificationCopyMeta({
            titleKey: "notify_trade_sold_rate_title",
            messageKey: "notify_trade_sold_rate_body",
            vars: { product },
          }),
        },
      });
      sent += 1;
    } catch {
      /* 한 사람 실패가 다른 사람 알림을 막지 않는다 */
    }
  }
  return sent;
}

/** ③ 거래 평가 도착 알림 — 공개 전(상대가 아직 평가하지 않음)일 때만 부른다. */
export async function notifyTradeRatingReceived(
  sb: Sb,
  args: { productChatId: string; reviewerId: string; revieweeId: string }
): Promise<boolean> {
  const revieweeId = args.revieweeId.trim();
  if (!revieweeId || revieweeId === args.reviewerId) return false;
  try {
    const { data } = await sb
      .from("product_chats")
      .select("id, post_id, community_messenger_room_id")
      .eq("id", args.productChatId)
      .maybeSingle();
    const chat = data as { id: string; post_id: string; community_messenger_room_id: string | null } | null;
    const cmRoomId = String(chat?.community_messenger_room_id ?? "").trim();
    if (!chat || !cmRoomId) return false;
    const [lang, nickMap] = await Promise.all([
      loadNotificationUserLanguage(sb, revieweeId),
      fetchNicknamesForUserIds(sb, [args.reviewerId]),
    ]);
    const name = nickMap.get(args.reviewerId) ?? notifySafeT(lang, "notify_peer_fallback");
    await appendUserNotification(sb, {
      user_id: revieweeId,
      notification_type: "status",
      title: notifySafeT(lang, "notify_trade_rating_received_title"),
      body: notifySafeT(lang, "notify_trade_rating_received_body", { vars: { name } }),
      link_url: tradeChatNotificationHref(cmRoomId, "product_chat"),
      domain: "trade_chat",
      ref_id: cmRoomId,
      sender_id: args.reviewerId,
      dedupe_key: `trade-rating:${chat.id}:${revieweeId}`,
      push_kind: "trade",
      meta: {
        kind: "trade_rating_received",
        room_id: cmRoomId,
        product_chat_id: chat.id,
        product_id: chat.post_id,
        actor_id: args.reviewerId,
        ...notificationCopyMeta({
          titleKey: "notify_trade_rating_received_title",
          messageKey: "notify_trade_rating_received_body",
          vars: { name },
        }),
      },
    });
    return true;
  } catch {
    return false;
  }
}
