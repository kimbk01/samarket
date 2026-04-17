import { MESSENGER_CHAT_ALERT_MIN_GAP_MS } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { playNotificationSound } from "@/lib/notifications/play-notification-sound";
import { playOrderMatchChatAlert } from "@/lib/notifications/play-order-match-alert";

const seenDedupeKeys = new Set<string>();
const MAX_KEYS = 400;

let lastPlayAt = 0;
/** 서로 다른 경로(Realtime·미읽음 폴링·채팅방 폴링)가 같은 수신을 중복 재생하지 않도록 — `MESSENGER_CHAT_ALERT_MIN_GAP_MS` */
const MIN_GAP_MS = MESSENGER_CHAT_ALERT_MIN_GAP_MS;

function pruneIfNeeded(): void {
  while (seenDedupeKeys.size >= MAX_KEYS) {
    const first = seenDedupeKeys.values().next().value;
    if (first === undefined) break;
    seenDedupeKeys.delete(first);
  }
}

/**
 * 동일 `dedupeKey`는 세션 동안 1회만, 서로 다른 키라도 짧은 간격 내에는 1번만 재생.
 * 채팅 관련 알림음 경로에서 공통 사용.
 */
function tryConsumeChatAlertSlot(dedupeKey: string): boolean {
  if (seenDedupeKeys.has(dedupeKey)) return false;
  const now = Date.now();
  if (now - lastPlayAt < MIN_GAP_MS) return false;
  pruneIfNeeded();
  seenDedupeKeys.add(dedupeKey);
  lastPlayAt = now;
  return true;
}

export function playCoalescedChatNotificationSound(dedupeKey: string): void {
  if (!tryConsumeChatAlertSlot(dedupeKey)) return;
  playNotificationSound();
}

export async function playCoalescedOrderMatchChatAlert(dedupeKey: string): Promise<void> {
  if (!tryConsumeChatAlertSlot(dedupeKey)) return;
  await playOrderMatchChatAlert();
}
