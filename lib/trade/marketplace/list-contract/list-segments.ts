/**
 * 거래 목록 계약 ②~⑤ — 순서 구간 조립 (`docs/dibay-marketplace-list-ssot-target.md` §3).
 *
 * 물품 종류 → 품목 옵션 → 가격 → 거래 상태 → 지역. 고르지 않은 기준은 한 구간.
 * 각 구간은 겹치지 않는 SQL 조건이고 합은 전체 공개 거래 글이다(누락 0 · 중복 0).
 * 구간마다 안내 줄 키(`section`)를 만든다 — 화면은 키가 바뀌는 곳에 줄을 그린다.
 */
import type { CompositionFilterClause } from "@/lib/trade/category-form/composition-filter-query";
import { buildCompositionFilterComplementOrBody } from "@/lib/trade/category-form/composition-filter-query";
import type { ListLocationPlan } from "@/lib/trade/marketplace/list-contract/list-location-blocks";
import type { TradeFeedQueryExtras } from "@/lib/posts/trade-posts-range-query";

export type ListTradeStateChoice = "all" | "active" | "sold";

export type ListSegment = {
  tradeCatIds: string[] | null;
  excludeTradeCatIds: string[] | null;
  /** 품목 옵션 「맞음」 구간이면 그 조건(AND), 아니면 undefined */
  compositionFilters: CompositionFilterClause[] | undefined;
  /** 가격 「범위 안」 구간이면 그 범위 */
  priceMin: number | undefined;
  priceMax: number | undefined;
  statusOr: string;
  loc: TradeFeedQueryExtras["tradeFeedLocation"] | undefined;
  applyLocation: boolean;
  /** 각 `.or()` 로 AND — 옵션 「안 맞음」·가격 「범위 밖」·내 동네 구분 */
  extraOrGroups: string[];
  /** 안내 줄 키 — 예: "cat:similar|loc:nearby". 첫 구간은 "" */
  section: string;
  /** 메모리 분류용 차원 인덱스 */
  dims: { cat: number; opt: number; price: number; state: number; loc: number };
};

export type ListSegmentInput = {
  /** 전체 대상 카테고리(HOME 거래 합집합) — null = 거래 전체 */
  universeTradeCategoryIds: string[] | null;
  rootTradeCategoryIds: string[] | null;
  topicTradeCategoryIds: string[] | null;
  compositionFilters: CompositionFilterClause[] | null | undefined;
  priceMin: number | undefined;
  priceMax: number | undefined;
  tradeState: ListTradeStateChoice;
  /** 판매중(공개) 상태 조건 — `HOME_POSTS_STATUS_OR` */
  activeStatusOr: string;
  /** 판매완료 상태 조건 — `status.eq.sold` */
  soldStatusOr: string;
  location: ListLocationPlan;
};

type CatPart = { ids: string[] | null; exclude: string[] | null; part: string | null };

function categoryParts(input: ListSegmentInput): CatPart[] {
  const universe =
    input.universeTradeCategoryIds && input.universeTradeCategoryIds.length > 0
      ? input.universeTradeCategoryIds
      : null;
  const root = input.rootTradeCategoryIds?.length ? input.rootTradeCategoryIds : null;
  const topic = input.topicTradeCategoryIds?.length ? input.topicTradeCategoryIds : null;
  if (!root) return [{ ids: universe, exclude: null, part: null }];
  const out: CatPart[] = [];
  if (topic) {
    out.push({ ids: topic, exclude: null, part: null });
    out.push({ ids: root, exclude: topic, part: "cat:similar" });
  } else {
    out.push({ ids: root, exclude: null, part: null });
  }
  out.push({ ids: universe, exclude: root, part: "cat:other" });
  return out;
}

type OptPart = { clauses: CompositionFilterClause[] | undefined; extra: string | null; part: string | null };

function optionParts(input: ListSegmentInput): OptPart[] {
  const clauses = input.compositionFilters?.length ? input.compositionFilters : null;
  const complement = clauses ? buildCompositionFilterComplementOrBody(clauses) : null;
  if (!clauses || !complement) return [{ clauses: undefined, extra: null, part: null }];
  return [
    { clauses, extra: null, part: null },
    { clauses: undefined, extra: complement, part: "opt:mismatch" },
  ];
}

type PricePart = { min: number | undefined; max: number | undefined; extra: string | null; part: string | null };

export function buildPriceComplementOrBody(min: number | undefined, max: number | undefined): string | null {
  const parts: string[] = [];
  if (min != null) parts.push(`price.lt.${min}`);
  if (max != null) parts.push(`price.gt.${max}`);
  if (parts.length === 0) return null;
  return ["price.is.null", ...parts].join(",");
}

function priceParts(input: ListSegmentInput): PricePart[] {
  const complement = buildPriceComplementOrBody(input.priceMin, input.priceMax);
  if (!complement) return [{ min: undefined, max: undefined, extra: null, part: null }];
  return [
    { min: input.priceMin, max: input.priceMax, extra: null, part: null },
    { min: undefined, max: undefined, extra: complement, part: "price:out" },
  ];
}

type StatePart = { statusOr: string; part: string | null };

function stateParts(input: ListSegmentInput): StatePart[] {
  if (input.tradeState === "sold") {
    return [
      { statusOr: input.soldStatusOr, part: null },
      { statusOr: input.activeStatusOr, part: "state:active" },
    ];
  }
  return [
    { statusOr: input.activeStatusOr, part: null },
    { statusOr: input.soldStatusOr, part: "state:sold" },
  ];
}

export function buildListSegments(input: ListSegmentInput): ListSegment[] {
  const cats = categoryParts(input);
  const opts = optionParts(input);
  const prices = priceParts(input);
  const states = stateParts(input);
  const locs = input.location.blocks;
  const out: ListSegment[] = [];
  cats.forEach((c, ci) =>
    opts.forEach((o, oi) =>
      prices.forEach((p, pi) =>
        states.forEach((s, si) =>
          locs.forEach((l, li) => {
            const parts = [c.part, o.part, p.part, s.part, l.part ? `loc:${l.part}` : null].filter(
              (x): x is string => Boolean(x)
            );
            const extra = [o.extra, p.extra, ...l.extraOrGroups].filter((x): x is string => Boolean(x));
            out.push({
              tradeCatIds: c.ids,
              excludeTradeCatIds: c.exclude,
              compositionFilters: o.clauses,
              priceMin: p.min,
              priceMax: p.max,
              statusOr: s.statusOr,
              loc: l.loc,
              applyLocation: l.applyLocation,
              extraOrGroups: extra,
              section: parts.join("|"),
              dims: { cat: ci, opt: oi, price: pi, state: si, loc: li },
            });
          })
        )
      )
    )
  );
  return out;
}

/** 검색 후보(메모리)를 구간에 넣기 위한 분류 — `buildListSegments` 와 같은 정의 */
export type ListRowLike = {
  trade_category_id?: string | null;
  category_id?: string | null;
  price?: number | null;
  status?: string | null;
  meta?: Record<string, unknown> | null;
  trade_lgu_id?: string | null;
  region?: string | null;
  city?: string | null;
};

function metaValue(row: ListRowLike, column: string): string | null {
  const m = /^meta->>([A-Za-z0-9_]+)$/.exec(column);
  if (m) {
    const v = row.meta?.[m[1]!];
    return v == null ? null : String(v);
  }
  const v = (row as Record<string, unknown>)[column];
  return v == null ? null : String(v);
}

/** `applyCompositionFilterClausesToPostgrest` 와 같은 판정(메모리) */
export function rowMatchesCompositionClauses(row: ListRowLike, clauses: CompositionFilterClause[]): boolean {
  for (const clause of clauses) {
    const n = Math.min(clause.columns.length, clause.values.length);
    if (clause.op === "exclude_eq") {
      for (let i = 0; i < n; i++) {
        const col = clause.columns[i];
        const v = clause.values[i];
        if (!col || !v) continue;
        if (metaValue(row, col) === v) return false;
      }
      continue;
    }
    if (clause.op === "or_eq") {
      let any = false;
      let considered = false;
      for (let i = 0; i < n; i++) {
        const col = clause.columns[i];
        const v = clause.values[i];
        if (!col || !v) continue;
        considered = true;
        if (metaValue(row, col) === v) any = true;
      }
      if (considered && !any) return false;
      continue;
    }
    if (clause.op === "eq") {
      const v = clause.values[0];
      if (!v || clause.columns.length === 0) continue;
      if (!clause.columns.some((col) => metaValue(row, col) === v)) return false;
      continue;
    }
    const col = clause.columns[0];
    if (!col || clause.values.length === 0) continue;
    const hay = (metaValue(row, col) ?? "").toLowerCase();
    if (!metaValue(row, col)) return false;
    if (!clause.values.some((v) => hay.includes(v.toLowerCase()))) return false;
  }
  return true;
}

/** 메모리 분류 — 같은 입력으로 만든 `buildListSegments` 결과의 인덱스 */
export function classifyListRowSegment(
  row: ListRowLike,
  input: ListSegmentInput,
  segments: ListSegment[]
): number {
  const cid = (row.trade_category_id ?? row.category_id ?? "").trim();
  const topic = input.topicTradeCategoryIds?.length ? new Set(input.topicTradeCategoryIds) : null;
  const root = input.rootTradeCategoryIds?.length ? new Set(input.rootTradeCategoryIds) : null;
  const cat = !root ? 0 : topic ? (topic.has(cid) ? 0 : root.has(cid) ? 1 : 2) : root.has(cid) ? 0 : 1;

  const clauses = input.compositionFilters?.length ? input.compositionFilters : null;
  const hasOptDim = Boolean(clauses && buildCompositionFilterComplementOrBody(clauses));
  const opt = hasOptDim ? (rowMatchesCompositionClauses(row, clauses!) ? 0 : 1) : 0;

  const hasPriceDim = buildPriceComplementOrBody(input.priceMin, input.priceMax) != null;
  const price = (() => {
    if (!hasPriceDim) return 0;
    const p = row.price;
    if (p == null || !Number.isFinite(Number(p))) return 1;
    if (input.priceMin != null && Number(p) < input.priceMin) return 1;
    if (input.priceMax != null && Number(p) > input.priceMax) return 1;
    return 0;
  })();

  const sold = String(row.status ?? "").toLowerCase() === "sold";
  const state = input.tradeState === "sold" ? (sold ? 0 : 1) : sold ? 1 : 0;

  const loc = input.location.blockOf(row);
  const idx = segments.findIndex(
    (s) =>
      s.dims.cat === cat &&
      s.dims.opt === opt &&
      s.dims.price === price &&
      s.dims.state === state &&
      s.dims.loc === loc
  );
  return idx < 0 ? segments.length - 1 : idx;
}
