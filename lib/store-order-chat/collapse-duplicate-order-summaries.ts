import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

type RoomMsg = CommunityMessengerMessage & { pending?: boolean };

const SUMMARY_MARKERS = ["📋 [주문 요약]", "📋 [매장] 주문 내용 전달", "📋 주문 요약", "[매장] 주문 내용 전달"] as const;

export function isStoreOrderSummarySystemContent(content: string): boolean {
  const c = content.trim();
  if (!c) return false;
  if (!SUMMARY_MARKERS.some((m) => c.startsWith(m))) return false;
  return c.includes("주문번호:") || c.includes("주문번호");
}

function summaryRank(m: RoomMsg): number {
  const kind = m.metadata?.kind;
  if (kind === "store_order_summary") return 3;
  if (m.content.includes("— 품목 —")) return 2;
  return 1;
}

/** 방에 서버 자동 요약(또는 동등 system 요약)이 있으면 true — 패널 수동 전송·중복 CTA 숨김 */
export function roomHasStoreOrderAutoSummary(
  messages: readonly Pick<CommunityMessengerMessage, "messageType" | "content" | "metadata">[]
): boolean {
  return messages.some(
    (m) =>
      m.metadata?.kind === "store_order_summary" || isStoreOrderSummarySystemContent(m.content)
  );
}

/** 동일 방에 레거시 텍스트·자동 system 요약이 둘 다 있으면 카드 1개만 표시 */
export function collapseDuplicateStoreOrderSummaryMessages(messages: RoomMsg[]): RoomMsg[] {
  const summaries = messages.filter(
    (m) => m.metadata?.kind === "store_order_summary" || isStoreOrderSummarySystemContent(m.content)
  );
  if (summaries.length <= 1) return messages;
  const keep = summaries.reduce((best, cur) => (summaryRank(cur) > summaryRank(best) ? cur : best));
  const dropIds = new Set(summaries.filter((m) => m.id !== keep.id).map((m) => m.id));
  if (!dropIds.size) return messages;
  return messages.filter((m) => !dropIds.has(m.id));
}

/** 배달·주문 채팅 타임라인에 store_order system 메시지가 있는지(도크 없어도 direct 레이아웃 판별) */
export function roomHasStoreOrderTimelineMessages(
  messages: readonly Pick<CommunityMessengerMessage, "messageType" | "content" | "metadata">[]
): boolean {
  return messages.some((m) => {
    if (m.metadata?.domain === "store_order") return true;
    return m.messageType === "system" && isStoreOrderSummarySystemContent(m.content);
  });
}

/** 주문 채팅 표시 목록 — 중복 요약 카드만 1개로 합침(상태 system 줄은 유지). */
export function finalizeStoreOrderChatDisplayMessages(messages: RoomMsg[]): RoomMsg[] {
  return collapseDuplicateStoreOrderSummaryMessages(messages);
}
