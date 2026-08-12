import { MESSENGER_CHAT_ALERT_MIN_GAP_MS } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { shouldSkipPushForEventDedupe } from "@/lib/notifications/core/notification-dedupe";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { eventKeyForNotificationDomain } from "@/lib/notifications/notification-sound-event-map";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import { ingestCanonicalNotificationSound } from "@/lib/notifications/notification-sound-decision";
import { playOrderMatchChatAlert } from "@/lib/notifications/play-order-match-alert";

const seenDedupeKeys = new Set<string>();
const MAX_KEYS = 400;

let lastPlayAt = 0;
/** 서로 다른 경로(Realtime·미읽음 폴링·채팅방 폴링)가 같은 수신을 중복 재생하지 않도록 — `MESSENGER_CHAT_ALERT_MIN_GAP_MS` */
const MIN_GAP_MS = MESSENGER_CHAT_ALERT_MIN_GAP_MS;

export type ChatAlertSoundSkipReason =
  | "duplicate_dedupe_key"
  | "min_gap"
  | "push_event_dedupe"
  | "empty_dedupe_key";

export type ChatAlertSoundScheduleResult =
  | { status: "scheduled"; dedupeKey: string }
  | { status: "skipped"; reason: ChatAlertSoundSkipReason };

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
function tryConsumeChatAlertSlot(dedupeKey: string): ChatAlertSoundScheduleResult {
  const key = dedupeKey.trim();
  if (!key) return { status: "skipped", reason: "empty_dedupe_key" };
  if (seenDedupeKeys.has(key)) return { status: "skipped", reason: "duplicate_dedupe_key" };
  const now = Date.now();
  if (now - lastPlayAt < MIN_GAP_MS) return { status: "skipped", reason: "min_gap" };
  pruneIfNeeded();
  seenDedupeKeys.add(key);
  lastPlayAt = now;
  return { status: "scheduled", dedupeKey: key };
}

/**
 * @param domain — `community_*`·`trade_chat` 는 domain adapter → SSOT eventKey.
 * 생략 시 `system_default` SSOT eventKey.
 * @returns 재생이 스케줄됐는지 (handled / notif INSERT 스킵 판단용)
 */
function canonicalIdFromDedupe(dedupeKey: string): string | null {
  const key = dedupeKey.trim();
  if (!key) return null;
  if (key.includes("->") || key.startsWith("messenger-participant:")) return null;
  if (/^\d{10,13}$/.test(key)) return null;
  const msg = key.match(/^msg:([^:]+)/);
  if (msg?.[1]) return msg[1];
  if (key.includes("Date.now") || /:\d{13}$/.test(key)) return null;
  return key;
}

export function playCoalescedChatNotificationSound(
  dedupeKey: string,
  domain?: NotificationDomain,
  notificationEventId?: string
): ChatAlertSoundScheduleResult {
  if (notificationEventId?.trim() && shouldSkipPushForEventDedupe(notificationEventId.trim())) {
    return { status: "skipped", reason: "push_event_dedupe" };
  }
  const identity = canonicalIdFromDedupe(dedupeKey) || notificationEventId?.trim() || "";
  if (!identity) return { status: "skipped", reason: "empty_dedupe_key" };
  const slot = tryConsumeChatAlertSlot(identity);
  if (slot.status !== "scheduled") return slot;
  const eventType = domain ? eventKeyForNotificationDomain(domain) : "system_default";
  ingestCanonicalNotificationSound({
    identityKind: "messenger_message",
    canonicalEventId: identity,
    recipientId: getBoundAuthUserId() ?? "",
    eventType,
    domain: domain ?? null,
    source: "realtime",
  });
  return slot;
}

export async function playCoalescedOrderMatchChatAlert(dedupeKey: string): Promise<ChatAlertSoundScheduleResult> {
  const slot = tryConsumeChatAlertSlot(dedupeKey);
  if (slot.status !== "scheduled") return slot;
  await playOrderMatchChatAlert();
  return slot;
}

/**
 * 주문 채팅 등 — Admin SSOT eventKey 직접 재생 (수신 coalescing 슬롯만 공유, 발신음과 분리).
 */
export function playCoalescedEventNotificationSound(
  dedupeKey: string,
  eventKey: string
): ChatAlertSoundScheduleResult {
  const key = eventKey.trim();
  if (!key) return { status: "skipped", reason: "empty_dedupe_key" };
  const identity = canonicalIdFromDedupe(dedupeKey);
  if (!identity) return { status: "skipped", reason: "empty_dedupe_key" };
  const slot = tryConsumeChatAlertSlot(identity);
  if (slot.status !== "scheduled") return slot;
  ingestCanonicalNotificationSound({
    identityKind: "messenger_message",
    canonicalEventId: identity,
    recipientId: getBoundAuthUserId() ?? "",
    eventType: key,
    source: "realtime",
  });
  return slot;
}

/** @internal vitest */
export function clearCoalescedChatAlertSoundForTests(): void {
  seenDedupeKeys.clear();
  lastPlayAt = 0;
}
