import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { MessageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";

/** 롱프레스 바에 노출하는 고정 반응 키(저장값과 동일) */
export const MESSENGER_QUICK_REACTION_KEYS = ["😀", "😮", "❤️", "👍", "👏", "😢"] as const;

export type MessengerQuickReactionKey = (typeof MESSENGER_QUICK_REACTION_KEYS)[number];

/** DB `reaction_key` CHECK: trim 후 1자 이상 · 32자 이하 */
export const MESSENGER_REACTION_KEY_MAX_CHARS = 32;

const EMOJI_GRAPHEME = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;

/**
 * 반응 키 = 이모지 글자 묶음(grapheme) 정확히 1개 (Owner 2026-11-16 「반응 확대 — 아무 이모지 1개」).
 * 바로 고르는 6개(`MESSENGER_QUICK_REACTION_KEYS`) 밖의 이모지도 허용하고, 글·이모지 2개·공백은 거부한다.
 */
export function isMessengerReactionKey(key: string): boolean {
  if (typeof key !== "string") return false;
  const k = key.trim();
  if (!k || k !== key || k.length > MESSENGER_REACTION_KEY_MAX_CHARS) return false;
  if (!EMOJI_GRAPHEME.test(k)) return false;
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return [...k].length <= 8;
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let n = 0;
  for (const part of seg.segment(k)) {
    n += 1;
    if (n > 1) return false;
    if (!EMOJI_GRAPHEME.test(part.segment)) return false;
  }
  return n === 1;
}

export function canReactToMessage(
  message: Pick<CommunityMessengerMessage, "messageType" | "pending" | "deletedForEveryoneAt" | "isMine">,
  roomKind: MessageRoomKindForActions
): boolean {
  if (message.isMine) return false;
  if (message.pending) return false;
  if (message.messageType === "system") return false;
  if (message.deletedForEveryoneAt) return false;
  if (roomKind === "trade" && message.messageType !== "text" && message.messageType !== "image" && message.messageType !== "sticker") {
    return false;
  }
  return true;
}
