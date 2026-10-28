/**
 * 샘플도 목록 조건을 따른다 (2026-10-28 실기: 「중고차 + Toyota」에 Honda 샘플이 보임).
 * - 주제: 주제 목록은 공개 API 가 거르고, 홈 목록 필터의 주제(categoryIds)는 여기서 거른다. 찾기(검색어): 샘플을 넣지 않는다(호출부).
 * - 거래 상태 「판매완료」만 보기 → 샘플 없음(샘플은 판매중).
 * - 가격 범위 → 샘플 가격으로 거른다.
 * - 품목 옵션 → 샘플 글 모양(meta)에 같은 칸이 있으면 같은 값만, 제조사(make)는 차 모델명 앞부분, 모르는 칸은 샘플 제외.
 */
import { listMarketAppliedConditions } from "@/lib/trade/marketplace/market-applied-conditions";
import { TRADE_SHOWCASE_LISTINGS } from "@/lib/trade/showcase/trade-showcase-listings";
import type { TradeShowcaseItem } from "@/lib/trade/showcase/trade-showcase-model";

export function filterTradeShowcaseForSearch(
  items: readonly TradeShowcaseItem[],
  search: string
): TradeShowcaseItem[] {
  const conditions = listMarketAppliedConditions(search);
  let out = [...items];
  for (const c of conditions) {
    if (c.key === "tradeState" && c.value === "sold") return [];
    if (c.key === "category" && c.categoryIds.length > 0) {
      const ids = new Set(c.categoryIds);
      out = out.filter((it) => it.trade_category_id != null && ids.has(it.trade_category_id));
    }
    if (c.key === "price") {
      out = out.filter((it) => {
        if (it.price == null) return false;
        if (c.min != null && it.price < c.min) return false;
        if (c.max != null && it.price > c.max) return false;
        return true;
      });
    }
    if (c.key.startsWith("option:") && "fieldId" in c) {
      const want = String(c.value).trim().toLowerCase();
      out = out.filter((it) => {
        const meta = TRADE_SHOWCASE_LISTINGS[it.sort_order]?.meta ?? {};
        const carModel = String(meta.car_model ?? "").trim().toLowerCase();
        /** 제조사·모델은 글의 차 이름(car_model = 「Toyota Vios …」)으로 맞춘다 — 실제 글과 같은 저장 칸 */
        if (c.fieldId === "make") return Boolean(carModel) && carModel.startsWith(want);
        if (c.fieldId === "model") return Boolean(carModel) && ` ${carModel} `.includes(` ${want.replace(/[-_]/g, " ")} `);
        if (!(c.fieldId in meta)) return false;
        return String(meta[c.fieldId]).trim().toLowerCase() === want;
      });
    }
  }
  return out;
}
