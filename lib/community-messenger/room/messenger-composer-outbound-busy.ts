/** 메신저 방 컴포저 — 다른 종류 전송·편집·삭제가 진행 중이면 추가 전송 차단 */
export type MessengerComposerBusy =
  | null
  | "send"
  | "send-sticker"
  | "send-image"
  | "send-file"
  | "send-voice"
  | "delete-message"
  | "edit-message"
  | string;

/** 텍스트 `send` 는 clientMessageId·낙관적 UI 로 병렬 전송 가능 — 여기서 막지 않음 */
export function isMessengerComposerOutboundBusy(busy: MessengerComposerBusy): boolean {
  return (
    busy === "send-sticker" ||
    busy === "send-image" ||
    busy === "send-file" ||
    busy === "delete-message" ||
    busy === "edit-message"
  );
}
