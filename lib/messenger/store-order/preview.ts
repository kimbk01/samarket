/**
 * StoreOrderPreviewPort — 최신 주문채팅 메시지만.
 * lastMessage/headline/summary 필드 혼용 입력 거부.
 */
import type { DomainPreview, MessengerPreviewPort } from "@/lib/messenger/contracts/ports";
import {
  assertStoreOrderPreviewDoesNotUseMetadata,
  assertStoreOrderPreviewOwnDomainOnly,
  contentHitsStoreOrderPreviewForbiddenMarkers,
  STORE_ORDER_DOMAIN,
} from "@/lib/messenger/store-order/design-lock";
import { resolveDomainListSystemPreviewText } from "@/lib/messenger/contracts/domain-list-system-preview";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";
import type { AppLanguageCode } from "@/lib/i18n/config";

/** PreviewPort 유일한 메시지 입력 — 다른 필드명으로 우회 금지 */
export type StoreOrderLatestChatMessage = Readonly<{
  text: string | null | undefined;
  messageType: string | null | undefined;
  isSystemAllowed?: boolean;
}>;

export type StoreOrderPreviewPortInput = Readonly<{
  chatDomain: string;
  latestChatMessage: StoreOrderLatestChatMessage | null | undefined;
  /** 아래 필드가 있으면 fail-closed (혼용 금지) */
  lastMessage?: string | null;
  headline?: string | null;
  summary?: string | null;
  orderNumber?: string | null;
  orderStatus?: string | null;
}>;

/** 메시지 없음 · body 빈 문자열 — 주문/상품 summary로 대체하지 않음 */
export const STORE_ORDER_EMPTY_CONVERSATION_PREVIEW = "메시지가 없습니다" as const;

/**
 * Latest body is an order-summary template (design-lock forbids showing it as list preview).
 * Row-level redact — do not throw (would kill whole Domain list compose).
 */
export const STORE_ORDER_SUMMARY_REDACTED_PREVIEW = "새 메시지" as const;

export function resolveStoreOrderPreview(input: StoreOrderPreviewPortInput): DomainPreview {
  assertStoreOrderPreviewOwnDomainOnly(input.chatDomain);
  assertStoreOrderPreviewDoesNotUseMetadata({
    lastMessageFieldAsPreview: input.lastMessage,
    headlineFieldAsPreview: input.headline,
    summaryFieldAsPreview: input.summary,
    orderNumberAsPreview: input.orderNumber,
    orderStatusAsPreview: input.orderStatus,
    orderSummaryAsPreview: input.summary,
    metadataHeadlineAsPreview: input.headline,
  });
  const message = input.latestChatMessage;
  if (!message) return { text: STORE_ORDER_EMPTY_CONVERSATION_PREVIEW, source: "empty" };
  const type = (message.messageType ?? "text").trim();
  const content = (message.text ?? "").trim();
  // Intentional policy: never surface 주문 요약/주문번호 templates in list preview.
  // Soften marker hit to row fallback (list compose must continue for other rooms).
  if (contentHitsStoreOrderPreviewForbiddenMarkers(content)) {
    return { text: STORE_ORDER_SUMMARY_REDACTED_PREVIEW, source: "empty" };
  }
  assertStoreOrderPreviewDoesNotUseMetadata({ content });
  if (type === "image") return { text: "사진", source: "latest_user_message" };
  if (type === "voice") return { text: "음성 메시지", source: "latest_user_message" };
  if (type === "file") return { text: content || "파일", source: "latest_user_message" };
  if (type === "system") {
    if (message.isSystemAllowed === false) {
      return { text: STORE_ORDER_EMPTY_CONVERSATION_PREVIEW, source: "empty" };
    }
    return {
      text: content || STORE_ORDER_EMPTY_CONVERSATION_PREVIEW,
      source: content ? "allowed_system_message" : "empty",
    };
  }
  if (!content) return { text: STORE_ORDER_EMPTY_CONVERSATION_PREVIEW, source: "empty" };
  if (isBareOrderStatusPreview(content)) {
    throw new Error("dibay_store_order_preview_status_text_forbidden");
  }
  return { text: content, source: "latest_user_message" };
}

/**
 * 언어 SSOT B3 — PreviewPort 에 넣을 최신 메시지 본문. 시스템 메시지(주문 사건·상품 상태 등)의 종류 코드 메타가
 * 저장 글자와 맞으면 보는 사람 언어 문장, 아니면 저장 글자 그대로. 주문 요약은 다루지 않는다(가림 정책 유지).
 */
export function storeOrderListItemPreviewSourceText(
  item: Pick<StoreOrderListItem, "latestChatMessageText" | "lastMessageMeta">,
  lang?: AppLanguageCode | null
): string {
  return (
    resolveDomainListSystemPreviewText(
      { lastMessage: item.latestChatMessageText, meta: item.lastMessageMeta },
      lang
    ) ?? item.latestChatMessageText
  );
}

const BARE_ORDER_STATUS_PREVIEWS = new Set([
  "배달중",
  "준비중",
  "접수",
  "완료",
  "취소",
  "주문완료",
  "조리중",
]);

function isBareOrderStatusPreview(content: string): boolean {
  return BARE_ORDER_STATUS_PREVIEWS.has(content);
}

export const storeOrderPreviewPort: MessengerPreviewPort = {
  domain: STORE_ORDER_DOMAIN,
  resolvePreview: () =>
    resolveStoreOrderPreview({ chatDomain: STORE_ORDER_DOMAIN, latestChatMessage: null }),
};
