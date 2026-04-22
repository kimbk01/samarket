import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

/** 클립보드 JSON 블록 식별(파서·향후 붙여넣기 자동 인식용) */
export const COMMUNITY_MESSENGER_INTERNAL_SHARE_JSON_MARKER = "\n---\n";

export type CommunityMessengerInternalShareCardV1 = {
  v: 1;
  kind: "community_messenger_message";
  sourceRoomId: string;
  messageId: string;
  messageType: CommunityMessengerMessage["messageType"];
  roomTitle: string;
  /** 표시·검색용 짧은 본문(원문 전체가 아닐 수 있음) */
  previewText: string;
  createdAt: string;
};

const MAX_PREVIEW_IN_CARD = 2000;
const MAX_PREVIEW_HUMAN = 1200;

/**
 * 다른 방으로 “카드” 형태 내부 공유 시 클립보드에 넣는 텍스트.
 * 상단은 사람이 읽기 쉬운 요약, 하단은 `parseInternalShareCardFromClipboard` 로 파싱 가능한 JSON 한 블록.
 */
export function buildCommunityMessengerInternalShareClipboard(input: {
  roomTitle: string;
  sourceRoomId: string;
  item: Pick<CommunityMessengerMessage, "id" | "messageType" | "createdAt">;
  previewText: string;
}): string {
  const preview = input.previewText.trim();
  const clipped = preview.slice(0, MAX_PREVIEW_IN_CARD);
  const card: CommunityMessengerInternalShareCardV1 = {
    v: 1,
    kind: "community_messenger_message",
    sourceRoomId: input.sourceRoomId.trim(),
    messageId: input.item.id.trim(),
    messageType: input.item.messageType,
    roomTitle: input.roomTitle.trim() || "대화",
    previewText: clipped,
    createdAt: input.item.createdAt,
  };
  const humanPreview = preview.slice(0, MAX_PREVIEW_HUMAN) + (preview.length > MAX_PREVIEW_HUMAN ? "…" : "");
  const human = [
    "[사마켓 메신저 · 메시지 카드]",
    `방: ${card.roomTitle}`,
    `메시지 유형: ${card.messageType}`,
    "미리보기:",
    humanPreview || "(내용 없음)",
  ].join("\n");
  return `${human}${COMMUNITY_MESSENGER_INTERNAL_SHARE_JSON_MARKER}${JSON.stringify(card)}`;
}

/** `buildCommunityMessengerInternalShareClipboard` 결과에서 카드 JSON만 추출 */
export function parseInternalShareCardFromClipboard(text: string): CommunityMessengerInternalShareCardV1 | null {
  const idx = text.lastIndexOf(COMMUNITY_MESSENGER_INTERNAL_SHARE_JSON_MARKER);
  if (idx === -1) return null;
  const jsonPart = text.slice(idx + COMMUNITY_MESSENGER_INTERNAL_SHARE_JSON_MARKER.length).trim();
  try {
    const o = JSON.parse(jsonPart) as CommunityMessengerInternalShareCardV1;
    if (o?.v !== 1 || o.kind !== "community_messenger_message") return null;
    if (!o.sourceRoomId?.trim() || !o.messageId?.trim()) return null;
    return o;
  } catch {
    return null;
  }
}
