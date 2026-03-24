/** 키는 DB·API에 그대로 저장 (다국어 라벨만 UI에서 매핑) */

export const BUYER_TO_SELLER_POSITIVE = [
  { key: "kind", label: "친절했어요" },
  { key: "fast_reply", label: "응답이 빨랐어요" },
  { key: "accurate_desc", label: "상품 설명이 정확했어요" },
  { key: "punctual", label: "시간 약속을 잘 지켰어요" },
  { key: "satisfied", label: "거래가 만족스러웠어요" },
] as const;

export const BUYER_TO_SELLER_NEGATIVE = [
  { key: "desc_mismatch", label: "상품 설명과 달라요" },
  { key: "slow_reply", label: "응답이 느려요" },
  { key: "changed_plan", label: "약속을 자주 바꿨어요" },
  { key: "unkind", label: "불친절했어요" },
  { key: "uncomfortable", label: "거래가 불편했어요" },
] as const;

export const SELLER_TO_BUYER_POSITIVE = [
  { key: "fast_reply_b", label: "응답이 빨랐어요" },
  { key: "punctual_b", label: "약속을 잘 지켰어요" },
  { key: "good_manner", label: "매너가 좋아요" },
  { key: "clean_deal", label: "거래가 깔끔했어요" },
] as const;

export const SELLER_TO_BUYER_NEGATIVE = [
  { key: "no_show", label: "노쇼했어요" },
  { key: "changed_plan_b", label: "약속을 반복 변경했어요" },
  { key: "lowball", label: "무리한 가격제안을 했어요" },
  { key: "bad_messages", label: "비매너 메시지가 있었어요" },
] as const;

const ALL_KEYS = new Set<string>([
  ...BUYER_TO_SELLER_POSITIVE.map((x) => x.key),
  ...BUYER_TO_SELLER_NEGATIVE.map((x) => x.key),
  ...SELLER_TO_BUYER_POSITIVE.map((x) => x.key),
  ...SELLER_TO_BUYER_NEGATIVE.map((x) => x.key),
]);

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
