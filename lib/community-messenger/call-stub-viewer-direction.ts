import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

/**
 * 통화 기록(call_stub) 말풍선의 **발신/수신 방향**은 stub 작성자(sender)가 아니라 통화 발신자(initiator) 기준이다.
 *
 * stub 작성자는 종료 액터(거절 = 수신자, 취소·부재중 = 발신자, 종료 = 끊은 사람)라서
 * `isMine`(작성자 == 나) 그대로 쓰면 거절 기록이 수신자에게 「발신」, 발신자에게 「수신」으로 뒤집힌다.
 *
 * 1:1 통화: viewer 는 initiator 또는 recipient 둘 중 하나.
 * - isMine(작성자 == viewer) 이면 viewer == sender → 발신 여부 = (sender == initiator)
 * - !isMine 이면 viewer == 상대 → 발신 여부 = (sender != initiator)
 * initiator 를 알 수 없으면(구 메타) 기존 isMine 을 유지한다.
 * 종료 사유 문구(거절함/거절됨 등)는 별도 presentation(HARD LOCK D)이 결정 — 여기서는 방향만.
 */
export function resolveCallStubViewerIsCaller(
  item: Pick<CommunityMessengerMessage, "messageType" | "isMine" | "senderId" | "metadata">
): boolean {
  const isMine = Boolean(item.isMine);
  if (item.messageType !== "call_stub") return isMine;
  const meta = item.metadata && typeof item.metadata === "object" ? (item.metadata as Record<string, unknown>) : null;
  const initiator = typeof meta?.initiatorUserId === "string" ? meta.initiatorUserId.trim().toLowerCase() : "";
  const sender = typeof item.senderId === "string" ? item.senderId.trim().toLowerCase() : "";
  if (!initiator || !sender) return isMine;
  const senderIsInitiator = sender === initiator;
  return isMine ? senderIsInitiator : !senderIsInitiator;
}

/** 타임라인 행 렌더용 — call_stub 은 정렬·톤·「발신/수신」을 발신자 기준 방향으로 맞춘 사본을 쓴다. */
export function withCallStubViewerDirection<T extends CommunityMessengerMessage>(item: T): T {
  if (item.messageType !== "call_stub") return item;
  const isCaller = resolveCallStubViewerIsCaller(item);
  return isCaller === Boolean(item.isMine) ? item : { ...item, isMine: isCaller };
}
