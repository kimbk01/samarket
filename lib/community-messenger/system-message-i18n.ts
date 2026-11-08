import type { MessageKey } from "@/lib/i18n/messages";
import { looksLikeMessageKey } from "@/lib/i18n/safe-ui-label";
import { sellerListingStateMessageKey } from "@/lib/products/seller-listing-state";
import { resolveStoreOrderOpsBodyText } from "@/lib/store-order-chat/store-order-ops-i18n";
import { resolveTradeListingChangeSystemState } from "@/lib/trade/trade-listing-change-system-message";

/**
 * 언어 SSOT B3 (`docs/audit/i18n-b3-stored-preview-design-2026-11-08.md`) — 저장된 시스템 문장을 보는 사람 언어로 다시 그린다.
 * 저장 글자는 남기고(구 앱·관리자 화면 호환), 종류 코드(`message_key`·`message_vars`·`kind`·`listingState`)가 있으면 키로 그린다.
 * 코드가 없거나 키가 카탈로그에 없으면 저장 글자. 통화 기록(call_stub)은 다루지 않는다(통화 영역).
 */

export type CmSystemTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 방 `last_message_meta` (DB 트리거 `cm_rooms_fill_last_message_meta` 가 채움) */
export type CmRoomLastMessageMeta = {
  text?: string;
  message_key?: string;
  message_vars?: Record<string, string | number>;
  kind?: string;
  listingState?: string;
  /** 주문 사건 줄 — 대화방 `resolveStoreOrderOpsBodyText` 와 같은 재료 */
  domain?: string;
  lineKind?: string;
  orderStatus?: string;
  orderFlow?: string;
  deliveryStatus?: string;
  cancel_kind?: string;
  cancel_reason?: string;
};

const META_STRING_FIELDS = [
  "kind",
  "listingState",
  "domain",
  "lineKind",
  "orderStatus",
  "orderFlow",
  "deliveryStatus",
  "cancel_kind",
  "cancel_reason",
] as const;

/** DB·실시간 값 → 메타(모양이 아니면 null). 문자열 값만 남긴다 */
export function parseCmRoomLastMessageMeta(raw: unknown): CmRoomLastMessageMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const text = typeof r.text === "string" ? r.text : undefined;
  if (!text) return null;
  const out: CmRoomLastMessageMeta = { text };
  if (typeof r.message_key === "string") out.message_key = r.message_key;
  const vars = asVars(r.message_vars);
  if (vars) out.message_vars = vars;
  for (const f of META_STRING_FIELDS) {
    const v = r[f];
    if (typeof v === "string") out[f] = v;
  }
  return out;
}

/**
 * 메시지 1건 → 방 메타 (DB `cm_room_last_system_meta_from_message` 와 같은 규칙).
 * 실시간 갱신으로 목록 행을 바꿀 때 서버 트리거와 같은 값을 만든다.
 */
export function cmRoomLastMessageMetaFromMessage(
  content: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined
): CmRoomLastMessageMeta | null {
  const text = cmSystemFirstLine(content);
  if (!text) return null;
  const raw: Record<string, unknown> = {
    text,
    message_key: metadata?.message_key,
    message_vars: metadata?.message_vars,
  };
  for (const f of META_STRING_FIELDS) raw[f] = metadata?.[f];
  return parseCmRoomLastMessageMeta(raw);
}

/** 저장 글자 첫 줄 — DB `cm_room_last_system_meta_from_message` 의 `text` 와 같은 규칙(앞 200자, \r 제거, 첫 줄, 앞뒤 공백 제거) */
export function cmSystemFirstLine(text: string | null | undefined): string {
  return String(text ?? "")
    .slice(0, 200)
    .replace(/\r/g, "")
    .split("\n")[0]!
    .trim();
}

function asVars(raw: unknown): Record<string, string | number> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  return out;
}

/** `message_key` 로 그린 문장. 키가 없거나 카탈로그에 없으면 null */
export function translateCmSystemMessageKey(
  metadata: { message_key?: unknown; message_vars?: unknown } | null | undefined,
  t: CmSystemTranslate
): string | null {
  const key = typeof metadata?.message_key === "string" ? metadata.message_key.trim() : "";
  if (!key || !looksLikeMessageKey(key)) return null;
  const out = t(key as MessageKey, asVars(metadata?.message_vars)).trim();
  if (!out || out === key || looksLikeMessageKey(out)) return null;
  return out;
}

/** 대화방 일반 시스템 줄 본문 — 키가 있으면 키, 없으면 저장 글자 */
export function resolveCmSystemMessageText(
  input: { content: string | null | undefined; metadata: Record<string, unknown> | null | undefined },
  t: CmSystemTranslate
): string {
  return translateCmSystemMessageKey(input.metadata, t) ?? String(input.content ?? "");
}

/**
 * 방 목록 미리보기(마지막 메시지가 시스템). null = 저장 글자를 그대로 쓴다.
 * 방 메타의 `text` 가 저장 글자 첫 줄과 같을 때만 메타를 믿는다(다른 메시지의 메타로 잘못 그리지 않음).
 */
export function resolveCmSystemListPreview(
  input: { lastMessage: string | null | undefined; meta: CmRoomLastMessageMeta | null | undefined },
  t: CmSystemTranslate
): string | null {
  const first = cmSystemFirstLine(input.lastMessage);
  if (!first) return null;
  const meta = input.meta && typeof input.meta === "object" ? input.meta : null;
  const metaMatches = Boolean(meta && typeof meta.text === "string" && meta.text.trim() === first);
  if (metaMatches && meta) {
    if (meta.kind === "store_order_summary") return t("cm_home_preview_order_summary");
    /** 주문 사건 — 대화방 줄과 같은 함수(저장 키가 정리돼도 주문 상태로 정본 문장) */
    if (meta.domain === "store_order") {
      const body = resolveStoreOrderOpsBodyText({
        orderStatus: meta.orderStatus?.trim() || "status",
        lineKind: meta.lineKind?.trim() || "status",
        content: String(input.lastMessage ?? ""),
        metadata: meta as Record<string, unknown>,
        t,
      });
      const line = cmSystemFirstLine(body);
      if (line) return line;
    }
    const byKey = translateCmSystemMessageKey(meta, t);
    if (byKey) return cmSystemFirstLine(byKey) || null;
  }
  /** 상품 상태 — 대화방 줄(`MessengerTradeListingChangeSystemRow`)과 같은 판정 함수(메타 우선, 구 본문) */
  const listingState = resolveTradeListingChangeSystemState({
    content: input.lastMessage,
    metadata:
      metaMatches && meta?.kind === "listing_change" && typeof meta.listingState === "string"
        ? { domain: "trade", kind: "listing_change", listingState: meta.listingState }
        : null,
  });
  if (listingState) {
    return t("cm_home_preview_listing_change", {
      title: t("trade_listing_change_system_title"),
      state: t(sellerListingStateMessageKey(listingState)),
    });
  }
  return null;
}
