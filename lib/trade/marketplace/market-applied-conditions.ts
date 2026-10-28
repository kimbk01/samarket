/**
 * 거래 목록 「적용된 조건」 SSOT (Owner 2026-10-28 승인 시안: 3단 칩 줄 없음 · 필터 안 적용 조건 · ✕ 즉시 해제).
 *
 * - 조건은 URL 이 유일한 원천이다. 화면(필터 시트 맨 위 칩)·필터 아이콘 개수·해제가 모두 이 파일만 쓴다.
 * - 순서 = 목록 계약 §3 순위(①검색어 ②물품 ③품목 옵션·가격 ④거래 상태 ⑥정렬). 위치·반경(⑤)은 📍 시트가 맡아 여기 없다.
 * - 물품(주제)을 빼면 그 주제의 품목 옵션(`filters[...]`)도 함께 뺀다(옵션은 주제에 딸린 조건 — 남으면 숨은 조건이 된다).
 */
import { parseCompositionFilterSearchParams } from "@/lib/trade/category-form/composition-filter-query";

export type MarketConditionKey = "q" | "category" | "price" | "tradeState" | "sort" | `option:${string}`;

export type MarketAppliedCondition =
  | { key: "q"; rank: 1; value: string }
  | { key: "category"; rank: 2; categoryIds: string[]; topic: string | null }
  | { key: `option:${string}`; rank: 3; fieldId: string; value: string }
  | { key: "price"; rank: 3; min: number | null; max: number | null }
  | { key: "tradeState"; rank: 4; value: "active" | "sold" }
  | { key: "sort"; rank: 6; value: "near" | "popular" };

function positive(raw: string | null): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function rootCategoryIds(sp: URLSearchParams): string[] {
  const multi = (sp.get("categoryIds") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (multi.length > 0) return multi;
  const one = (sp.get("category") ?? "").trim();
  return one ? [one] : [];
}

/** 지금 URL 에 걸린 조건 — 목록 계약 순위 순 */
export function listMarketAppliedConditions(search: string): MarketAppliedCondition[] {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: MarketAppliedCondition[] = [];

  const q = (sp.get("q") ?? "").trim();
  if (q) out.push({ key: "q", rank: 1, value: q });

  const cats = rootCategoryIds(sp);
  if (cats.length > 0) {
    out.push({ key: "category", rank: 2, categoryIds: cats, topic: (sp.get("topic") ?? "").trim() || null });
  }

  const options = parseCompositionFilterSearchParams(sp);
  for (const fieldId of Object.keys(options).sort()) {
    out.push({ key: `option:${fieldId}`, rank: 3, fieldId, value: options[fieldId]! });
  }

  const min = positive(sp.get("priceMin"));
  const max = positive(sp.get("priceMax"));
  if (min != null || max != null) out.push({ key: "price", rank: 3, min, max });

  const ts = (sp.get("tradeState") ?? "").trim().toLowerCase();
  if (ts === "active" || ts === "sold") out.push({ key: "tradeState", rank: 4, value: ts });

  const sort = (sp.get("sort") ?? sp.get("fs") ?? "").trim().toLowerCase();
  if (sort === "near" || sort === "distance") out.push({ key: "sort", rank: 6, value: "near" });
  else if (sort === "popular") out.push({ key: "sort", rank: 6, value: "popular" });

  return out;
}

/** 필터 아이콘 개수 = 적용된 조건 수(옵션은 하나씩) */
export function countMarketAppliedConditions(search: string): number {
  return listMarketAppliedConditions(search).length;
}

/** 조건 하나를 뺀 다음 쿼리(앞 `?` 없음). 페이지 키는 항상 지워 맨 위부터 새로 읽는다 */
export function removeMarketCondition(search: string, key: MarketConditionKey): string {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  sp.delete("page");
  sp.delete("cursor");
  if (key === "q") {
    sp.delete("q");
  } else if (key === "category") {
    for (const k of ["category", "categoryIds", "topic", "topicByRoot"]) sp.delete(k);
    for (const k of [...sp.keys()]) if (k.startsWith("filters[")) sp.delete(k);
  } else if (key === "price") {
    sp.delete("priceMin");
    sp.delete("priceMax");
  } else if (key === "tradeState") {
    sp.delete("tradeState");
  } else if (key === "sort") {
    sp.delete("sort");
    sp.delete("fs");
  } else if (key.startsWith("option:")) {
    sp.delete(`filters[${key.slice("option:".length)}]`);
  }
  return sp.toString();
}
