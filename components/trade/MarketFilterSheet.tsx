"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay/DibayOverlayActions";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * 필터 시트 소유 범위: 정렬 + 가격 + 판매상태
 * 카테고리 → 탭 행 [카테고리] 버튼 (MarketplaceMoreBrowseSheet)
 * 지역 → 탭 행 [지역] 버튼 (TradeHeaderLocationPinButton)
 */

type SortOption = "latest" | "near" | "popular";
type TradeStateOption = "all" | "active" | "sold";

interface MarketFilterState {
  sort: SortOption;
  tradeState: TradeStateOption;
  priceMin: string;
  priceMax: string;
}

export interface MarketFilterSheetProps {
  open: boolean;
  onClose: () => void;
  /** 현재 /market URL searchParams 문자열 */
  baseSearch: string;
}

function parseSortFromSearch(base: string): SortOption {
  const sp = new URLSearchParams(base);
  const s = (sp.get("sort") ?? sp.get("fs") ?? "").trim().toLowerCase();
  if (s === "near" || s === "distance") return "near";
  if (s === "popular") return "popular";
  return "latest";
}

function parseTradeStateFromSearch(base: string): TradeStateOption {
  const sp = new URLSearchParams(base);
  const s = (sp.get("tradeState") ?? "").trim().toLowerCase();
  if (s === "active") return "active";
  if (s === "sold") return "sold";
  return "all";
}

/** 이 시트가 소유하는 파라미터만 재설정, 나머지(category/location 등)는 그대로 보존 */
function buildFilterHref(state: MarketFilterState, baseSearch: string): string {
  const raw = new URLSearchParams(baseSearch);
  const sp = new URLSearchParams();

  for (const [k, v] of raw.entries()) {
    if (k === "tradeState" || k === "sort" || k === "fs" || k === "priceMin" || k === "priceMax")
      continue;
    sp.append(k, v);
  }

  if (state.sort === "near") sp.set("sort", "near");
  else if (state.sort === "popular") sp.set("sort", "popular");

  if (state.tradeState === "active" || state.tradeState === "sold") {
    sp.set("tradeState", state.tradeState);
  }

  const minNum = Number(state.priceMin);
  const maxNum = Number(state.priceMax);
  if (state.priceMin && !Number.isNaN(minNum) && minNum > 0) sp.set("priceMin", String(minNum));
  if (state.priceMax && !Number.isNaN(maxNum) && maxNum > 0) sp.set("priceMax", String(maxNum));

  const qs = sp.toString();
  return qs ? `/market?${qs}` : "/market";
}

/** 이 시트가 소유하는 활성 필터 수 (탭 행 뱃지용으로도 export) */
export function countActiveMarketFilters(baseSearch: string): number {
  const sp = new URLSearchParams(baseSearch);
  let n = 0;
  const sort = (sp.get("sort") ?? sp.get("fs") ?? "").toLowerCase();
  if (sort === "near" || sort === "distance" || sort === "popular") n++;
  const ts = sp.get("tradeState") ?? "";
  if (ts === "active" || ts === "sold") n++;
  const min = Number(sp.get("priceMin"));
  const max = Number(sp.get("priceMax"));
  if (!Number.isNaN(min) && min > 0) n++;
  if (!Number.isNaN(max) && max > 0) n++;
  return n;
}

export function MarketFilterSheet({ open, onClose, baseSearch }: MarketFilterSheetProps) {
  const { safeT } = useI18n();
  const router = useRouter();

  const raw = new URLSearchParams(baseSearch);

  const [state, setState] = useState<MarketFilterState>(() => ({
    sort: parseSortFromSearch(baseSearch),
    tradeState: parseTradeStateFromSearch(baseSearch),
    priceMin: raw.get("priceMin") ?? "",
    priceMax: raw.get("priceMax") ?? "",
  }));

  // Sync state when sheet opens with fresh baseSearch
  const [lastBase, setLastBase] = useState(baseSearch);
  if (open && baseSearch !== lastBase) {
    setLastBase(baseSearch);
    setState({
      sort: parseSortFromSearch(baseSearch),
      tradeState: parseTradeStateFromSearch(baseSearch),
      priceMin: new URLSearchParams(baseSearch).get("priceMin") ?? "",
      priceMax: new URLSearchParams(baseSearch).get("priceMax") ?? "",
    });
  }

  function clearAll() {
    setState({ sort: "latest", tradeState: "all", priceMin: "", priceMax: "" });
  }

  function applyFilters() {
    const href = buildFilterHref(state, baseSearch);
    onClose();
    router.replace(href, { scroll: false });
  }

  const appliedChips: string[] = [];
  if (state.sort === "near")
    appliedChips.push(safeT("marketplace_filter_sort_distance", { fallbackKo: "가까운순", fallbackEn: "Nearest" }));
  if (state.sort === "popular")
    appliedChips.push(safeT("marketplace_filter_sort_popular", { fallbackKo: "인기순", fallbackEn: "Popular" }));
  if (state.tradeState === "active")
    appliedChips.push(safeT("marketplace_filter_trade_state_active", { fallbackKo: "판매중", fallbackEn: "Available" }));
  if (state.tradeState === "sold")
    appliedChips.push(safeT("marketplace_filter_trade_state_sold", { fallbackKo: "판매완료", fallbackEn: "Sold" }));
  if (state.priceMin || state.priceMax) {
    const minLabel = state.priceMin ? `₱${state.priceMin}` : "";
    const maxLabel = state.priceMax ? `₱${state.priceMax}` : "";
    appliedChips.push(
      minLabel && maxLabel
        ? `${minLabel} – ${maxLabel}`
        : minLabel
          ? `${minLabel}+`
          : `~${maxLabel}`
    );
  }

  const sortOptions = [
    { value: "latest" as SortOption, fallbackKo: "최신순", fallbackEn: "Latest", key: "marketplace_filter_sort_latest" as const },
    { value: "near" as SortOption, fallbackKo: "가까운순", fallbackEn: "Nearest", key: "marketplace_filter_sort_distance" as const },
    { value: "popular" as SortOption, fallbackKo: "인기순", fallbackEn: "Popular", key: "marketplace_filter_sort_popular" as const },
  ];

  const tradeStateOptions = [
    { value: "all" as TradeStateOption, fallbackKo: "전체", fallbackEn: "All", key: "marketplace_filter_trade_state_all" as const },
    { value: "active" as TradeStateOption, fallbackKo: "판매중", fallbackEn: "Available", key: "marketplace_filter_trade_state_active" as const },
    { value: "sold" as TradeStateOption, fallbackKo: "판매완료", fallbackEn: "Sold", key: "marketplace_filter_trade_state_sold" as const },
  ];

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={safeT("marketplace_filter_sheet_title", { fallbackKo: "필터 및 정렬", fallbackEn: "Filter & Sort" })}
      footer={
        <DibayOverlayButton roleTone="primary" onClick={applyFilters}>
          {safeT("marketplace_filter_view_results", { fallbackKo: "결과 보기", fallbackEn: "View results" })}
        </DibayOverlayButton>
      }
    >
      <div className="flex flex-col gap-6 px-4 py-3">
        {/* Applied chips */}
        {appliedChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={Sam.text.helper}>
              {safeT("marketplace_filter_applied", { fallbackKo: "적용된 필터", fallbackEn: "Applied filters" })}
            </span>
            {appliedChips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center rounded-full border border-sam-border bg-sam-surface px-2.5 py-0.5 text-sm text-sam-fg"
              >
                {chip}
              </span>
            ))}
            <button
              type="button"
              className={`${Sam.text.helper} ml-auto underline`}
              onClick={clearAll}
            >
              {safeT("marketplace_filter_clear_all", { fallbackKo: "모두 지우기", fallbackEn: "Clear all" })}
            </button>
          </div>
        )}

        {/* Sort */}
        <FilterSection
          label={safeT("marketplace_filter_sort_label", { fallbackKo: "정렬", fallbackEn: "Sort by" })}
        >
          {sortOptions.map((opt) => (
            <RadioItem
              key={opt.value}
              checked={state.sort === opt.value}
              label={safeT(opt.key, { fallbackKo: opt.fallbackKo, fallbackEn: opt.fallbackEn })}
              onChange={() => setState((s) => ({ ...s, sort: opt.value }))}
            />
          ))}
        </FilterSection>

        {/* Price */}
        <FilterSection
          label={safeT("marketplace_filter_price_label", { fallbackKo: "가격", fallbackEn: "Price" })}
        >
          <div className="flex w-full items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={safeT("trade_market_price_min", { fallbackKo: "최소 가격", fallbackEn: "Min price" })}
              value={state.priceMin}
              onChange={(e) => setState((s) => ({ ...s, priceMin: e.target.value }))}
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg placeholder:text-sam-fg-muted focus:outline-none focus:ring-1 focus:ring-sam-brand"
            />
            <span className={`${Sam.text.helper} shrink-0`}>–</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={safeT("trade_market_price_max", { fallbackKo: "최대 가격", fallbackEn: "Max price" })}
              value={state.priceMax}
              onChange={(e) => setState((s) => ({ ...s, priceMax: e.target.value }))}
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg placeholder:text-sam-fg-muted focus:outline-none focus:ring-1 focus:ring-sam-brand"
            />
          </div>
        </FilterSection>

        {/* Trade state */}
        <FilterSection
          label={safeT("marketplace_filter_trade_state_label", { fallbackKo: "판매 상태", fallbackEn: "Trade status" })}
        >
          {tradeStateOptions.map((opt) => (
            <RadioItem
              key={opt.value}
              checked={state.tradeState === opt.value}
              label={safeT(opt.key, { fallbackKo: opt.fallbackKo, fallbackEn: opt.fallbackEn })}
              onChange={() => setState((s) => ({ ...s, tradeState: opt.value }))}
            />
          ))}
        </FilterSection>
      </div>
    </DibayBottomSheet>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className={`${Sam.text.helper} font-medium`}>{label}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-3">{children}</div>
    </div>
  );
}

function RadioItem({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="radio"
        className="h-4 w-4 accent-sam-brand"
        checked={checked}
        onChange={onChange}
      />
      <span className="text-sm text-sam-fg">{label}</span>
    </label>
  );
}
