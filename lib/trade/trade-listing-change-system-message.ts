import {
  normalizeSellerListingState,
  SELLER_LISTING_LABEL,
  type SellerListingState,
} from "@/lib/products/seller-listing-state";

/**
 * 거래 판매 단계 변경 시스템 메시지 — 구조화 메타데이터 (SYS-01, 2026-10-27).
 * 화면은 본문 문자열이 아니라 이 메타(없으면 레거시 본문 파싱)로 문장·상태 칩·시각을 그린다.
 */
export type TradeListingChangeSystemMetadata = {
  domain: "trade";
  kind: "listing_change";
  listingState: SellerListingState;
};

export function buildTradeListingChangeSystemMetadata(
  state: SellerListingState
): TradeListingChangeSystemMetadata {
  return { domain: "trade", kind: "listing_change", listingState: state };
}

/** 레거시 본문: `제품의 상태가 {라벨}으로 변경되었습니다.` + (구) `\n{서버 UTC 시각}` */
const LEGACY_LISTING_CHANGE_RE = /^(?:\[[^\]]+\]\s*)?제품의 상태가 (.+?)으로 변경되었습니다\.?(?:\n[\s\S]*)?$/;

const STATE_BY_LABEL: Record<string, SellerListingState> = Object.fromEntries(
  (Object.entries(SELLER_LISTING_LABEL) as Array<[SellerListingState, string]>).map(([state, label]) => [
    label,
    state,
  ])
);

/**
 * 시스템 메시지가 거래 단계 변경이면 상태를 돌려준다. 메타 우선, 없으면 레거시 본문 파싱.
 * 레거시 본문 끝의 박힌 시각은 버린다(틀린 UTC 시각).
 */
export function resolveTradeListingChangeSystemState(input: {
  content: string | null | undefined;
  metadata: Record<string, unknown> | null | undefined;
}): SellerListingState | null {
  const meta = input.metadata;
  if (meta && meta.domain === "trade" && meta.kind === "listing_change" && typeof meta.listingState === "string") {
    return normalizeSellerListingState(meta.listingState);
  }
  const m = LEGACY_LISTING_CHANGE_RE.exec(String(input.content ?? "").trim());
  if (!m) return null;
  return STATE_BY_LABEL[m[1].trim()] ?? null;
}
