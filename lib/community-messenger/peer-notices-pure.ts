/** Client-safe helpers for unknown-peer notice visibility (no server imports). */

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function shouldShowUnknownPeerNotice(input: {
  isFriend: boolean;
  blockedByMe: boolean;
  dismissed: boolean;
  /** @id 검색으로 대화를 연 상대(발신자)가 아닌, 먼저 메시지를 받은 쪽만 */
  isRecipient: boolean;
}): boolean {
  if (!input.isRecipient || input.blockedByMe || input.isFriend || input.dismissed) return false;
  return true;
}

type InboundDirectChatMessage = {
  senderId?: string | null;
  messageType?: string | null;
  createdAt?: string | null;
};

/** 1:1 direct — 상대가 먼저 보낸 채팅을 받은 viewer 만 unknown peer notice 대상 */
export function isViewerRecipientOfInboundDirectChat(input: {
  viewerUserId: string;
  peerUserId: string;
  messages: ReadonlyArray<InboundDirectChatMessage>;
}): boolean {
  const viewer = trimText(input.viewerUserId);
  const peer = trimText(input.peerUserId);
  if (!viewer || !peer) return false;

  const chatMessages = input.messages
    .filter((message) => {
      const type = trimText(message.messageType);
      if (type === "system" || type === "call_stub") return false;
      return Boolean(trimText(message.senderId));
    })
    .sort(
      (a, b) =>
        new Date(trimText(a.createdAt) || 0).getTime() -
        new Date(trimText(b.createdAt) || 0).getTime()
    );

  const first = chatMessages[0];
  if (!first) return false;
  return trimText(first.senderId) === peer;
}
