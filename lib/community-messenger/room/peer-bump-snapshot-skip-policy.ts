import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { MAX_BUMP_REPLY_PREVIEW_CHARS } from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";

/**
 * L1 (P2 수신 측) — 상대가 보낸 **새** 텍스트·스티커 bump 스냅샷을 병합했으면 단건 GET(`messages/{id}`)을 생략한다.
 *
 * 모두 참일 때만 생략(하나라도 아니면 기존대로 단건 정합):
 * ① 스냅샷 파싱 성공(`senderId === fromUserId`·roomId·messageId 교차검증은 파서가 이미 함)
 * ② 서버 직렬화가 본문을 자르지 않음
 * ③ 병합 **전** 로컬에 같은 id 가 없었음(= 새 INSERT. 같은 id 수정·삭제·반응은 기존 경로)
 * ④ 종류가 text·sticker (이미지·파일·음성·통화 기록 등은 서명 URL·메타 보강 가능성 → GET)
 * ⑤ 답장이면 인용 문구가 스냅샷에 있고 직렬화 상한(500자)에 닿지 않음(잘렸을 수 있으면 GET)
 *   (서버는 cleared_at 수신자에게 답장 스냅샷을 보내지 않는다)
 * ⑥ 보낸 사람 이름이 채워짐(방 멤버 표시 이름으로 보강된 뒤)
 */
export function shouldSkipPeerBumpSingleGet(input: {
  snapshot: Pick<
    CommunityMessengerMessage,
    "id" | "messageType" | "replyToMessageId" | "replyPreviewText" | "senderLabel"
  > | null;
  snapshotTruncated: boolean;
  existedLocallyBeforeMerge: boolean;
}): boolean {
  const snap = input.snapshot;
  if (!snap) return false;
  if (input.snapshotTruncated) return false;
  if (input.existedLocallyBeforeMerge) return false;
  if (snap.messageType !== "text" && snap.messageType !== "sticker") return false;
  const replyTo = String(snap.replyToMessageId ?? "").trim();
  if (replyTo) {
    const quote = String(snap.replyPreviewText ?? "").trim();
    if (!quote || quote.length >= MAX_BUMP_REPLY_PREVIEW_CHARS) return false;
  }
  if (!String(snap.senderLabel ?? "").trim()) return false;
  return true;
}
