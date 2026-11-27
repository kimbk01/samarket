/**
 * StoreOrderPreviewPort — 최신 주문채팅 메시지만.
 * lastMessage/headline/summary 필드 혼용 입력 거부.
 */
import { isStoreOrderMatchAckText } from "@/lib/chats/store-order-match-ack-text";
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
import { translate } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

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
  /** 보는 사람 언어 — 서버 조립은 요청 언어를 넘긴다. 없으면 클라이언트 런타임 언어 */
  lang?: AppLanguageCode | null;
}>;

/** 메시지 없음 · body 빈 문자열 — 주문/상품 summary로 대체하지 않음 (옛 한국어 고정값 — 비교·테스트 호환용, 화면은 키) */
export const STORE_ORDER_EMPTY_CONVERSATION_PREVIEW = "메시지가 없습니다" as const;
/** 메시지 없음 화면 문구 키 */
export const STORE_ORDER_EMPTY_CONVERSATION_PREVIEW_KEY = "community_messenger_no_messages" as const;

/**
 * Latest body is an order-summary template (design-lock forbids showing it as list preview).
 * Row-level redact — do not throw (would kill whole Domain list compose).
 */
export const STORE_ORDER_SUMMARY_REDACTED_PREVIEW = "새 메시지" as const;
/** 주문 요약 가림 화면 문구 키 (옛 고정값 `STORE_ORDER_SUMMARY_REDACTED_PREVIEW` 대신) */
export const STORE_ORDER_SUMMARY_REDACTED_PREVIEW_KEY = "notify_preview_new_message" as const;

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
  const viewerLang = input.lang ?? getRuntimeAppLanguage();
  const emptyText = translate(viewerLang, STORE_ORDER_EMPTY_CONVERSATION_PREVIEW_KEY);
  const message = input.latestChatMessage;
  if (!message) return { text: emptyText, source: "empty" };
  const type = (message.messageType ?? "text").trim();
  const content = (message.text ?? "").trim();
  // Intentional policy: never surface 주문 요약/주문번호 templates in list preview.
  // Soften marker hit to row fallback (list compose must continue for other rooms).
  if (contentHitsStoreOrderPreviewForbiddenMarkers(content)) {
    return { text: translate(viewerLang, STORE_ORDER_SUMMARY_REDACTED_PREVIEW_KEY), source: "empty" };
  }
  assertStoreOrderPreviewDoesNotUseMetadata({ content });
  if (type === "image") return { text: translate(viewerLang, "cm_home_preview_photo"), source: "latest_user_message" };
  if (type === "voice") return { text: translate(viewerLang, "cm_home_preview_voice"), source: "latest_user_message" };
  if (type === "file") {
    return { text: content || translate(viewerLang, "cm_home_preview_file"), source: "latest_user_message" };
  }
  if (type === "system") {
    if (message.isSystemAllowed === false) {
      return { text: emptyText, source: "empty" };
    }
    return {
      text: content || emptyText,
      source: content ? "allowed_system_message" : "empty",
    };
  }
  if (!content) return { text: emptyText, source: "empty" };
  if (isBareOrderStatusPreview(content)) {
    throw new Error("dibay_store_order_preview_status_text_forbidden");
  }
  /** 주문 「일치합니다」 자동 응답(ko·en 저장) → 보는 사람 언어 */
  if (isStoreOrderMatchAckText(content)) {
    return { text: translate(viewerLang, "store_order_match_ack"), source: "latest_user_message" };
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
