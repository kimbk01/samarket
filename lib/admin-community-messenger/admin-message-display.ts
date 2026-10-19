/**
 * 채팅 Admin R1 (B) — CM 메시지 행(`message_type` + `content` + `metadata`)을 관리자 화면 표시용으로 정리.
 *
 * - 순수 함수 — 서버 로더·클라이언트 컴포넌트 양쪽에서 import 가능 (서버 전용 모듈 import 금지).
 * - `roomId`·`messageId` 가 있으면 메신저 버킷 첨부 URL 을 관리자 조회 라우트(`ctx=admin`)로 바꾼다
 *   (비공개 버킷·권한·열람 감사 경유). 없으면 저장된 값을 그대로 둔다.
 * - 사용자 측 매핑(`mapCommunityMessengerDbMessageRowToMessage`)과 같은 metadata 키를 읽는다.
 */
import { messengerImageClientFieldsFromMetadata } from "@/lib/community-messenger/messenger-image-message-map";
import { isStoreOrderSummarySystemContent } from "@/lib/store-order-chat/collapse-duplicate-order-summaries";
import { buildAdminMessengerMediaUrl } from "@/lib/admin-community-messenger/admin-media-url";

export type AdminCmMessageKind =
  | "text"
  | "image"
  | "file"
  | "voice"
  | "system"
  | "order_summary"
  | "call_stub"
  | "other";

export type AdminCmMessageDisplay = {
  kind: AdminCmMessageKind;
  /** 원본 message_type (표시·기술 정보용) */
  rawType: string;
  /** 본문 텍스트 (첨부 메시지는 URL 대신 파일명 등) */
  text: string;
  /** 이미지(앨범 포함) 원본 URL 목록 */
  imageUrls: string[];
  /** file / voice 첨부 URL */
  attachmentUrl: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  voiceDurationSeconds: number | null;
  callKind: string | null;
  callStatus: string | null;
  orderSummary: { orderNo: string; orderStatus: string; itemCount: number } | null;
};

function s(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function nonNegInt(value: unknown): number | null {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function buildAdminCmMessageDisplay(input: {
  messageType: string | null | undefined;
  content: string | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
  /** CM 방 id — 첨부를 관리자 조회 라우트로 바꿀 때 필요 */
  roomId?: string | null;
  messageId?: string | null;
}): AdminCmMessageDisplay {
  const route = (url: string): string =>
    buildAdminMessengerMediaUrl({ roomId: input.roomId, messageId: input.messageId, url });
  const rawType = s(input.messageType) || "text";
  const content = typeof input.content === "string" ? input.content : "";
  const contentTrim = content.trim();
  const metadata = (input.metadata ?? {}) as Record<string, unknown>;
  const base: AdminCmMessageDisplay = {
    kind: "text",
    rawType,
    text: content,
    imageUrls: [],
    attachmentUrl: null,
    fileName: null,
    fileSizeBytes: null,
    mimeType: null,
    voiceDurationSeconds: null,
    callKind: null,
    callStatus: null,
    orderSummary: null,
  };

  if (rawType === "image") {
    const fields = messengerImageClientFieldsFromMetadata("image", metadata, contentTrim);
    const urls = (fields.imageAlbumOriginalUrls?.length ? fields.imageAlbumOriginalUrls : null) ??
      (fields.imageAlbumUrls?.length ? fields.imageAlbumUrls : null) ??
      [fields.imageOriginalUrl ?? fields.imagePreviewUrl ?? ""].filter(Boolean);
    return {
      ...base,
      kind: "image",
      imageUrls: urls.filter((u) => isHttpUrl(u)).map(route),
      text: isHttpUrl(contentTrim) ? "" : content,
    };
  }

  if (rawType === "file") {
    return {
      ...base,
      kind: "file",
      attachmentUrl: isHttpUrl(contentTrim) ? route(contentTrim) : null,
      fileName: s(metadata.fileName) || null,
      fileSizeBytes: nonNegInt(metadata.fileSizeBytes),
      mimeType: s(metadata.mimeType) || null,
      text: isHttpUrl(contentTrim) ? "" : content,
    };
  }

  if (rawType === "voice") {
    return {
      ...base,
      kind: "voice",
      attachmentUrl: isHttpUrl(contentTrim) ? route(contentTrim) : null,
      voiceDurationSeconds: nonNegInt(metadata.durationSeconds),
      mimeType: s(metadata.mimeType) || null,
      text: isHttpUrl(contentTrim) ? "" : content,
    };
  }

  if (rawType === "call_stub") {
    return {
      ...base,
      kind: "call_stub",
      callKind: s(metadata.callKind) || null,
      callStatus: s(metadata.callStatus) || null,
    };
  }

  if (rawType === "system") {
    const isSummary =
      s(metadata.kind) === "store_order_summary" || isStoreOrderSummarySystemContent(content);
    if (isSummary) {
      const order = (metadata.order ?? {}) as Record<string, unknown>;
      const items = Array.isArray(metadata.items) ? metadata.items : [];
      return {
        ...base,
        kind: "order_summary",
        orderSummary: {
          orderNo: s(metadata.orderNo) || s(order.order_no),
          orderStatus: s(metadata.orderStatus) || s(order.order_status),
          itemCount: items.length,
        },
      };
    }
    return { ...base, kind: "system" };
  }

  if (rawType === "text") return base;
  return { ...base, kind: "other" };
}
