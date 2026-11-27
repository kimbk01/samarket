/**
 * 알림 저장 문장 → 보는 사람 언어 (언어 재감사 2026-11-27 설계 §2-4·§4-3).
 *
 * 1) 새 행: 발송 때 meta 에 `titleKey`·`messageKey`·`vars`(·`varKeys`)를 함께 저장한다(`notificationCopyMeta`).
 *    title·body 는 푸시용으로 지금처럼 받는 사람 언어 문장을 그대로 둔다. 화면은 meta 로 다시 그린다.
 * 2) 옛 행: meta 가 없으면 카탈로그 알림 문구(ko·en)를 거꾸로 찾아 키로 되돌린다. 못 찾으면(사람이 쓴 글) 그대로.
 *    언어 사후 검토 E1 (2026-11-27): 본문은 치환 틀 + 시스템 본문 고정 문장만 대응하고, 댓글·답글·메시지 미리보기 행은
 *    건너뛴다(사람이 쓴 「좋아요」가 알림 제목 「Like」로 바뀌던 결함).
 * 3) 대체 이름(「상대」·「회원」 등, E4①): 서버가 대체값을 넣은 행만 보는 사람 언어로 바꾼다 — 새 행은 대체 이름을
 *    vars 에 넣지 않고 `varKeys` + meta `peerFallback: true` 로 저장한다. 표시가 없는 행의 같은 글자(사람이 정한 닉네임)는 원문.
 * 통화(부재중 등)·채팅 행은 다루지 않는다 — 호출자 `resolve-commerce-notification-inbox-text.ts` 가 거른다.
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { MESSAGES, translate, type MessageKey } from "@/lib/i18n/messages";
import {
  createCatalogTemplateMatcher,
  renderCatalogTemplateMatch,
} from "@/lib/i18n/stored-text-template-match";

export type NotificationCopyMetaInput = {
  titleKey?: MessageKey | null;
  messageKey?: MessageKey | null;
  vars?: Record<string, string | number | null | undefined>;
  /**
   * 치환값 중 그 자체가 문구 키인 것(대체 이름 등) — 그릴 때 보는 사람 언어로 바꾼다.
   * 하나라도 있으면 meta `peerFallback: true` 를 함께 저장한다(E4①).
   */
  varKeys?: Record<string, MessageKey | null | undefined>;
};

/** meta 에 펼쳐 넣는 값 — `{ ...notificationCopyMeta({...}) }` */
export function notificationCopyMeta(input: NotificationCopyMetaInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.titleKey) out.titleKey = input.titleKey;
  if (input.messageKey) out.messageKey = input.messageKey;
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(input.vars ?? {})) {
    if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) vars[k] = v;
  }
  if (Object.keys(vars).length > 0) out.vars = vars;
  const varKeys: Record<string, MessageKey> = {};
  for (const [k, v] of Object.entries(input.varKeys ?? {})) {
    if (v) varKeys[k] = v;
  }
  if (Object.keys(varKeys).length > 0) {
    out.varKeys = varKeys;
    out.peerFallback = true;
  }
  return out;
}

/** 서버가 대체 이름을 넣은 행인가 (E4① — meta `peerFallback`) */
function hasPeerFallbackMark(m: Record<string, unknown> | null): boolean {
  return m?.peerFallback === true;
}

function isKnownKey(v: unknown): v is MessageKey {
  return typeof v === "string" && v.length > 0 && (MESSAGES.ko as unknown as Record<string, string>)[v] !== undefined;
}

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const UNREPLACED = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/;

/** 치환값 자리에 들어간 대체 이름(「상대」·「회원」 등) — meta `peerFallback` 표시가 있는 행만 보는 사람 언어로 */
const FALLBACK_VALUE_KEYS: readonly MessageKey[] = [
  "notify_peer_fallback",
  "notify_member_fallback_name",
  "notify_group_fallback",
  "notify_trade_product_fallback",
  "offer_fallback_product",
  "notify_commerce_store_fallback",
];
const matchFallbackValue = createCatalogTemplateMatcher(FALLBACK_VALUE_KEYS);

/** meta.titleKey / meta.messageKey 로 다시 그린다. 키가 없거나 쓸 수 없으면 null */
export function renderNotificationCopyFromMeta(
  lang: AppLanguageCode,
  meta: Record<string, unknown> | null | undefined,
  part: "title" | "body"
): string | null {
  const m = record(meta);
  if (!m) return null;
  const key = part === "title" ? m.titleKey : m.messageKey;
  if (!isKnownKey(key)) return null;
  const vars: Record<string, string | number> = {};
  const rawVars = record(m.vars);
  const peerFallback = hasPeerFallbackMark(m);
  if (rawVars) {
    for (const [k, v] of Object.entries(rawVars)) {
      if (typeof v === "number" && Number.isFinite(v)) vars[k] = v;
      else if (typeof v === "string") {
        const fallback = peerFallback ? matchFallbackValue(v) : null;
        vars[k] = fallback ? translate(lang, fallback.key) : v;
      }
    }
  }
  const rawVarKeys = record(m.varKeys);
  if (rawVarKeys) {
    for (const [k, v] of Object.entries(rawVarKeys)) {
      if (isKnownKey(v)) vars[k] = translate(lang, v);
    }
  }
  const out = translate(lang, key, vars).trim();
  if (!out || out === key || UNREPLACED.test(out)) return null;
  return out;
}

/** 옛 행 대응표에 넣는 알림 문구 키 — 발송 코드가 쓰는 접두 */
const LEGACY_NOTIFICATION_KEY_PREFIXES = ["notify_", "offer_notif_", "promo_notice_", "feed_ad_notice_"] as const;
/** 접두 밖이지만 알림 행에 저장되는 문구 */
const LEGACY_NOTIFICATION_EXTRA_KEYS: readonly string[] = ["support_message_deleted"];

const matchLegacyNotificationText = createCatalogTemplateMatcher(
  (key) =>
    LEGACY_NOTIFICATION_EXTRA_KEYS.includes(key) ||
    LEGACY_NOTIFICATION_KEY_PREFIXES.some((p) => key.startsWith(p))
);

/** 본문 고정 문장(치환값 없음)으로 대응해도 되는 키 — 시스템이 쓰는 본문 문장만(제목·대체 이름·분류 이름 제외) */
function isFixedSystemBodyKey(key: string): boolean {
  return /_body($|_)/.test(key) || key.endsWith("_message") || LEGACY_NOTIFICATION_EXTRA_KEYS.includes(key);
}

/** 본문이 사람이 쓴 미리보기인 알림 종류 (meta.kind) — 본문은 옛 문장 대응을 하지 않는다(E1) */
const PREVIEW_BODY_KINDS: ReadonlySet<string> = new Set([
  "community_comment",
  "comment",
  "reply",
  "moim_comment",
  "chat",
  "trade_chat",
  "community_chat",
  "group_chat",
  "job_apply_chat",
  "message",
  "trade_message",
  "group_message",
  "general_message",
  "mention_message",
  "store_order_message",
  "store_to_customer_message",
  "customer_to_store_message",
]);

/** 본문이 댓글·답글·메시지 미리보기인 행인가 — meta.kind 또는 meta.preview 표시 */
export function isNotificationPreviewBodyRow(meta: Record<string, unknown> | null | undefined): boolean {
  const m = record(meta);
  if (!m) return false;
  if (m.preview === true) return true;
  const kind = typeof m.kind === "string" ? m.kind.trim() : "";
  return Boolean(kind) && PREVIEW_BODY_KINDS.has(kind);
}

/**
 * 옛 알림 문장 → 보는 사람 언어. 카탈로그 알림 문구가 아니면(사람이 쓴 글) null.
 * - `part: "title"`(기본): 알림 문구 전체(고정 문장·치환 틀)로 대응한다.
 * - `part: "body"`(E1): 치환 틀 + 시스템 본문 고정 문장만 대응한다. 미리보기 행은 호출자가 거른다(`isNotificationPreviewBodyRow`).
 * 대체 이름 값(「상대」 등)은 옛 행에 meta 표시가 없어 원문 그대로 둔다(E4① — 사람이 정한 닉네임과 구분할 수 없음).
 */
export function mapLegacyNotificationText(
  lang: AppLanguageCode,
  text: string | null | undefined,
  part: "title" | "body" = "title"
): string | null {
  const match = matchLegacyNotificationText(text);
  if (!match) return null;
  if (part === "body" && match.fixed && !isFixedSystemBodyKey(match.key)) return null;
  return renderCatalogTemplateMatch(lang, match);
}
