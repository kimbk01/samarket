/** 키는 DB·API에 그대로 저장 (다국어 라벨만 UI에서 매핑) */

import type { MessageKey } from "@/lib/i18n/messages";

export type TradeReviewTranslate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

export const BUYER_TO_SELLER_POSITIVE = [
  { key: "kind", labelKey: "trade_review_tag_kind" as const },
  { key: "fast_reply", labelKey: "trade_review_tag_fast_reply" as const },
  { key: "accurate_desc", labelKey: "trade_review_tag_accurate_desc" as const },
  { key: "punctual", labelKey: "trade_review_tag_punctual" as const },
  { key: "satisfied", labelKey: "trade_review_tag_satisfied" as const },
] as const;

export const BUYER_TO_SELLER_NEGATIVE = [
  { key: "desc_mismatch", labelKey: "trade_review_tag_desc_mismatch" as const },
  { key: "slow_reply", labelKey: "trade_review_tag_slow_reply" as const },
  { key: "changed_plan", labelKey: "trade_review_tag_changed_plan" as const },
  { key: "unkind", labelKey: "trade_review_tag_unkind" as const },
  { key: "uncomfortable", labelKey: "trade_review_tag_uncomfortable" as const },
] as const;

export const SELLER_TO_BUYER_POSITIVE = [
  { key: "fast_reply_b", labelKey: "trade_review_tag_fast_reply" as const },
  { key: "punctual_b", labelKey: "trade_review_tag_punctual_b" as const },
  { key: "good_manner", labelKey: "trade_review_tag_good_manner" as const },
  { key: "clean_deal", labelKey: "trade_review_tag_clean_deal" as const },
] as const;

export const SELLER_TO_BUYER_NEGATIVE = [
  { key: "no_show", labelKey: "trade_review_tag_no_show" as const },
  { key: "changed_plan_b", labelKey: "trade_review_tag_changed_plan_b" as const },
  { key: "lowball", labelKey: "trade_review_tag_lowball" as const },
  { key: "bad_messages", labelKey: "trade_review_tag_bad_messages" as const },
] as const;

const ALL_KEYS = new Set<string>([
  ...BUYER_TO_SELLER_POSITIVE.map((x) => x.key),
  ...BUYER_TO_SELLER_NEGATIVE.map((x) => x.key),
  ...SELLER_TO_BUYER_POSITIVE.map((x) => x.key),
  ...SELLER_TO_BUYER_NEGATIVE.map((x) => x.key),
]);

export function tradeReviewTagLabel(
  t: TradeReviewTranslate,
  role: "buyer_to_seller" | "seller_to_buyer",
  tagKey: string
): string {
  const list =
    role === "buyer_to_seller"
      ? [...BUYER_TO_SELLER_POSITIVE, ...BUYER_TO_SELLER_NEGATIVE]
      : [...SELLER_TO_BUYER_POSITIVE, ...SELLER_TO_BUYER_NEGATIVE];
  const hit = list.find((x) => x.key === tagKey);
  return hit ? t(hit.labelKey) : tagKey;
}

export function filterValidTagKeys(keys: string[] | undefined, role: "buyer_to_seller" | "seller_to_buyer"): string[] {
  const allowed: Set<string> =
    role === "buyer_to_seller"
      ? new Set([
          ...BUYER_TO_SELLER_POSITIVE.map((x) => x.key),
          ...BUYER_TO_SELLER_NEGATIVE.map((x) => x.key),
        ])
      : new Set([
          ...SELLER_TO_BUYER_POSITIVE.map((x) => x.key),
          ...SELLER_TO_BUYER_NEGATIVE.map((x) => x.key),
        ]);
  if (!keys?.length) return [];
  return keys.filter((k) => typeof k === "string" && allowed.has(k) && ALL_KEYS.has(k));
}

/** 전화·URL·과도한 숫자 나열 완화 */
export function sanitizeReviewComment(raw: string | undefined | null, maxLen = 200): string {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim().slice(0, maxLen);
  s = s.replace(/\b\d{2,4}-\d{3,4}-\d{4}\b/g, "");
  s = s.replace(/\b010-?\d{4}-?\d{4}\b/g, "");
  s = s.replace(/\+63[\d\s-]{8,16}/gi, "");
  s = s.replace(/https?:\/\/\S+/gi, "");
  return s.trim().slice(0, maxLen);
}
