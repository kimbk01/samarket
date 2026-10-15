import {
  isMessengerComposerOutboundBusy,
  type MessengerComposerBusy,
} from "@/lib/community-messenger/room/messenger-composer-outbound-busy";

export type ComposerTextSendBlockInput = {
  busy: MessengerComposerBusy;
  roomUnavailable: boolean;
  draft: string;
};

/**
 * 텍스트 전송 차단 여부 — 전송 버튼 `sendDisabled` 와 `commitTextSend` 가드의 단일 정의.
 * 두 곳이 어긋나면 "버튼은 활성인데 눌러도 아무 일 없음" 이 된다.
 * - 진행 중인 다른 outbound(스티커·이미지·파일·삭제·편집) 또는 음성 전송 중이면 차단.
 * - 텍스트 `send` 는 낙관적 병렬 전송이 가능하므로 차단하지 않는다.
 */
export function isComposerTextSendBlocked(input: ComposerTextSendBlockInput): boolean {
  if (input.roomUnavailable) return true;
  if (!input.draft.trim()) return true;
  return isMessengerComposerOutboundBusy(input.busy) || input.busy === "send-voice";
}
