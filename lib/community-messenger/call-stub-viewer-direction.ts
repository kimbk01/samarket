import {
  resolveCallStubEventFromMessageMetadata,
  resolveViewerCallRole,
} from "@/lib/community-messenger/call-event-message";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

/**
 * 통화 기록(call_stub) 말풍선의 정렬·톤·「발신/수신」은 **통화 발신자(initiator) 기준**이어야 한다.
 *
 * stub 작성자(sender)는 종료 행위자다(거절 = 수신자, 취소·부재중 = 발신자, 종료 = 끊은 사람 —
 * `service.ts` `stubActorUserId`). 그래서 `isMine`(작성자 == 나) 그대로 쓰면 상대가 끊거나 거절한 내 발신 통화가
 * 상대 쪽(왼쪽) 「수신」 말풍선으로 보인다 — 상대가 보내지 않은 메시지처럼 보이는 원인.
 *
 * 뷰어 id 는 행에 없으므로 1:1 당사자(initiator·recipient)와 작성자로 복원한다:
 * - isMine → 뷰어 = 작성자
 * - !isMine → 뷰어 = 1:1 상대편(작성자가 initiator 면 recipient, recipient 면 initiator)
 * 당사자 메타가 없거나(구 stub) 작성자가 당사자가 아니면(그룹 등) 판단하지 않고 기존 `isMine` 을 유지한다.
 * 상태 문구(거절함/거절됨 등)는 이미 뷰어·initiator 기준(`getCallStubTimelineStatusLine`)이라 여기서 다루지 않는다.
 */
export function resolveCallStubViewerIsCaller(
  item: Pick<CommunityMessengerMessage, "messageType" | "isMine" | "senderId" | "metadata">
): boolean {
  const isMine = Boolean(item.isMine);
  if (item.messageType !== "call_stub") return isMine;
  const meta =
    item.metadata && typeof item.metadata === "object" ? (item.metadata as Record<string, unknown>) : null;
  const parties = resolveCallStubEventFromMessageMetadata(meta);
  const initiator = parties.initiatorUserId?.trim().toLowerCase() ?? "";
  const recipient = parties.recipientUserId?.trim().toLowerCase() ?? "";
  const sender = typeof item.senderId === "string" ? item.senderId.trim().toLowerCase() : "";
  if (!initiator || !recipient || !sender) return isMine;
  const viewer = isMine ? sender : sender === initiator ? recipient : sender === recipient ? initiator : "";
  const role = resolveViewerCallRole(viewer, initiator, recipient);
  return role ? role === "caller" : isMine;
}
