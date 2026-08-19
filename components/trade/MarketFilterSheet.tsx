"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay/DibayOverlayActions";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getChildCategories } from "@/lib/categories/getChildCategories";
import { resolveTradeCategoryUILabel } from "@/lib/i18n/trade-category-label-i18n";
import { CompositionAttributeFilterSelects } from "@/components/search/CompositionAttributeFilterSelects";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  applyTradeLocationScopeToSearchParams,
  buildTradeCityScopeFromCanonical,
  parseTradeLocationScopeFromSearchParams,
  tradeLocationScopeDisplayLabel,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";
import {
  TRADE_BROWSE_RECOMMENDED_RADIUS_KM,
  TRADE_LOCATION_RADIUS_PARAM,
  sanitizeTradeBrowseRadiusKm,
  type TradeBrowseRadiusSelection,
  tradeBrowseRadiusSelectionFromKm,
} from "@/lib/trade/location/trade-browse-radius";
import {
  readTradeBrowseLocationDraftSession,
} from "@/lib/trade/location/trade-browse-location-draft-session";
import { resolveTradeMarketplaceDefaultCityFromMaster } from "@/lib/trade/location/resolve-trade-marketplace-default-city";
import { buildMarketplaceBrowseResetCommittedHref } from "@/lib/trade/marketplace/browse-reset-href";
import { applyMarketplaceBrowseResetClientEffects } from "@/lib/trade/marketplace/marketplace-browse-reset-client-effects";
import {
  appendCompositionFilterSearchParams,
  sanitizeCompositionFilterSelection,
  resolveCompositionAttributeFilterFields,
  resolveTradeCompositionForCategory,
  type CompositionFilterSelection,
} from "@/lib/trade/category-form";
import { marketplaceMoreBrowseHasFilterOptions } from "@/lib/trade/tabs/marketplace-more-browse";

type SortOption = "latest" | "near" | "popular";
type TradeStateOption = "all" | "active" | "sold";

type RegionMode = "commit" | "other" | "all";

type DraftState = {
  sort: SortOption;
  tradeState: TradeStateOption;
  priceMin: string;
  priceMax: string;

  rootCategoryId: string | null;
  /** ROOT multi selection (URL: `categoryIds`) */
  rootCategoryIds: string[];
  topicKey: string | null; // child.slug||child.id in URL contract (for current primary root)
  /**
   * ROOT-keyed optional child map.
   * - URL: `topicByRoot=<rootId>:<topicKey>` (repeated)
   * - UI: `topicKey` is just the currently edited primary root's value.
   */
  topicByRoot: Record<string, string | null>;
  /**
   * Currently edited ROOT for child(topic) picker.
   * - primary root는 `rootCategoryId`
   * - topic 편집은 `topicEditRootId`로 전환 가능(멀티 ROOT일 때도 각 root별 topic 선택)
   */
  topicEditRootId: string | null;
  filters: CompositionFilterSelection;

  regionMode: RegionMode;
  radiusKm: number;
  /** `거리: 전체` 선택 시 URL의 radius 파라미터를 의도적으로 생략 */
  distanceAll: boolean;
};

type AppliedChip = {
  id: "category" | "distance" | "tradeState" | "price";
  label: string;
};

export interface MarketFilterSheetProps {
  open: boolean;
  onClose: () => void;
  baseSearch: string;
  topics: CategoryWithSettings[];
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

function parsePriceFromSearch(base: string): { priceMin: string; priceMax: string } {
  const sp = new URLSearchParams(base);
  return {
    priceMin: sp.get("priceMin") ?? "",
    priceMax: sp.get("priceMax") ?? "",
  };
}

function parseRootFromSearch(base: string): { categoryId: string | null; topicKey: string | null } {
  const sp = new URLSearchParams(base);
  const category = sp.get("category") ?? "";
  const topic = sp.get("topic") ?? "";
  return {
    categoryId: category.trim() ? category.trim() : null,
    topicKey: topic.trim() ? topic.trim() : null,
  };
}

function parseKnownCompositionSelectionFromSearch(opts: {
  baseSearch: string;
  root: CategoryWithSettings;
}): CompositionFilterSelection {
  const sp = new URLSearchParams(opts.baseSearch);
  const composition = resolveTradeCompositionForCategory(opts.root);
  const fields = resolveCompositionAttributeFilterFields(composition);
  const next: CompositionFilterSelection = {};
  for (const f of fields) {
    const raw = sp.get(f.id);
    if (raw == null || raw === "") continue;
    next[f.id] = raw;
  }
  return next;
}

function unionCompositionFieldIds(topics: CategoryWithSettings[]): string[] {
  const s = new Set<string>();
  for (const root of topics) {
    const composition = resolveTradeCompositionForCategory(root);
    const fields = resolveCompositionAttributeFilterFields(composition);
    for (const f of fields) s.add(f.id);
  }
  return [...s];
}

export function countActiveMarketFilters(baseSearch: string): number {
  const sp = new URLSearchParams(baseSearch);
  let n = 0;

  const categoryIds = (sp.get("categoryIds") ?? "").trim();
  const category = (sp.get("category") ?? "").trim();
  if (categoryIds || category) n++;

  const location = (sp.get("location") ?? "").trim().toLowerCase();
  const radiusRaw = sp.get(TRADE_LOCATION_RADIUS_PARAM);
  if (location === "city" && radiusRaw != null && String(radiusRaw).trim() !== "") {
    n++;
  }

  const ts = (sp.get("tradeState") ?? "").trim().toLowerCase();
  if (ts === "active" || ts === "sold") n++;

  const min = Number(sp.get("priceMin"));
  const max = Number(sp.get("priceMax"));
  if (!Number.isNaN(min) && min > 0) n++;
  if (!Number.isNaN(max) && max > 0) n++;
  // 가격은 min/max 중 하나라도 있으면 1로 보이게끔 보정
  if (min > 0 || max > 0) n -= (min > 0 ? 1 : 0) + (max > 0 ? 1 : 0) - 1;
  return Math.max(0, n);
}

export function buildMarketFilterResetHref(opts: {
  baseSearch: string;
  topics: CategoryWithSettings[];
}): string {
  const sp = new URLSearchParams(opts.baseSearch);
  const knownFieldIds = unionCompositionFieldIds(opts.topics);

  for (const k of [
    "category",
    "categoryIds",
    "topic",
    "topicByRoot",
    "tradeState",
    "sort",
    "fs",
    "priceMin",
    "priceMax",
    "location",
    "lgu",
    "radius",
    "page",
    "cursor",
  ]) {
    sp.delete(k);
  }
  // composition filter params are stored as `filters[<fieldId>]`
  for (const fid of knownFieldIds) sp.delete(`filters[${fid}]`);

  // q는 KEEP (검색은 filter가 아님)
  const q = sp.get("q");
  if (q == null || q === "") sp.delete("q");

  const qs = sp.toString();
  return qs ? `/market?${qs}` : "/market";
}

function priceChipLabel(priceMin: string, priceMax: string): string | null {
  if (!priceMin && !priceMax) return null;
  const minLabel = priceMin ? `₱${priceMin}` : "";
  const maxLabel = priceMax ? `₱${priceMax}` : "";
  return minLabel && maxLabel ? `${minLabel} – ${maxLabel}` : minLabel ? `${minLabel}+` : `~${maxLabel}`;
}

export function MarketFilterSheet({
  open,
  onClose,
  baseSearch,
  topics,
}: MarketFilterSheetProps) {
  const { language, safeT } = useI18n();
  const router = useRouter();
  // location picker uses sessionStorage draft. `MarketFilterSheet` reads it at render/apply time.
  const draftFromLocationPicker = readTradeBrowseLocationDraftSession();
  const committedScope = useMemo(
    () => parseTradeLocationScopeFromSearchParams(new URLSearchParams(baseSearch)),
    [baseSearch]
  );
  const [masterRegionLabel, setMasterRegionLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void resolveTradeMarketplaceDefaultCityFromMaster().then((scope) => {
      if (cancelled || !scope) return;
      setMasterRegionLabel(tradeLocationScopeDisplayLabel(scope));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const myRegionCommitLabel = useMemo(() => {
    if (committedScope.mode === "city") {
      return tradeLocationScopeDisplayLabel(committedScope) ?? masterRegionLabel;
    }
    return masterRegionLabel;
  }, [committedScope, masterRegionLabel]);

  const knownFieldIds = useMemo(() => unionCompositionFieldIds(topics), [topics]);

  const rootFromSearch = useMemo(() => parseRootFromSearch(baseSearch), [baseSearch]);
  const committedCityCanonical =
    committedScope.mode === "city" ? committedScope.canonicalId : null;
  const initialRadiusKm =
    committedScope.mode === "city" && committedScope.radiusKm != null
      ? committedScope.radiusKm
      : TRADE_BROWSE_RECOMMENDED_RADIUS_KM;
  const radiusRaw = new URLSearchParams(baseSearch).get(TRADE_LOCATION_RADIUS_PARAM);
  // `distance: 전체`는 "URL에 radius가 없는 경우"로만 취급 (명시된 radius=64는 쿼리 의미 유지)
  const initialDistanceAll = committedScope.mode === "city" ? radiusRaw == null || radiusRaw === "" : true;

  const [state, setState] = useState<DraftState>(() => ({
    sort: parseSortFromSearch(baseSearch),
    tradeState: parseTradeStateFromSearch(baseSearch),
    ...parsePriceFromSearch(baseSearch),

    rootCategoryIds: (() => {
      const sp = new URLSearchParams(baseSearch);
      const raw = sp.get("categoryIds");
      const ids = raw && raw.trim() ? raw.split(",").map((x) => x.trim()).filter(Boolean) : [];
      if (ids.length > 0) return ids;
      return rootFromSearch.categoryId ? [rootFromSearch.categoryId] : [];
    })(),
    rootCategoryId: (() => {
      const sp = new URLSearchParams(baseSearch);
      const raw = sp.get("categoryIds");
      const ids = raw && raw.trim() ? raw.split(",").map((x) => x.trim()).filter(Boolean) : [];
      if (rootFromSearch.categoryId) return rootFromSearch.categoryId;
      return ids[0] ?? null;
    })(),
    topicByRoot: (() => {
      const sp = new URLSearchParams(baseSearch);
      const rawRoots = sp.get("categoryIds");
      const selectedRootIds =
        rawRoots && rawRoots.trim()
          ? rawRoots.split(",").map((x) => x.trim()).filter(Boolean)
          : rootFromSearch.categoryId
            ? [rootFromSearch.categoryId]
            : [];
      const selectedSet = new Set(selectedRootIds);

      const out: Record<string, string | null> = {};
      const pairsRaw = sp.getAll("topicByRoot").join(",");
      if (pairsRaw.trim()) {
        for (const part of pairsRaw.split(",")) {
          const p = part.trim();
          if (!p) continue;
          const idx = p.indexOf(":");
          if (idx <= 0) continue;
          const rootId = p.slice(0, idx).trim();
          const topicKey = p.slice(idx + 1).trim();
          if (!rootId) continue;
          if (!selectedSet.has(rootId)) continue;
          if (!topicKey) {
            out[rootId] = null;
            continue;
          }
          out[rootId] = topicKey;
        }
      }

      const primary = rootFromSearch.categoryId ?? selectedRootIds[0] ?? null;
      // backward compatible: legacy `topic` is the primary-root topic
      if (primary && rootFromSearch.topicKey && out[primary] == null) {
        out[primary] = rootFromSearch.topicKey;
      }

      // prune empties
      for (const k of Object.keys(out)) {
        if (!selectedSet.has(k)) delete out[k];
      }
      return out;
    })(),
    topicKey: (() => {
      const primary = (() => {
        const sp = new URLSearchParams(baseSearch);
        const rawRoots = sp.get("categoryIds");
        const selectedRootIds =
          rawRoots && rawRoots.trim()
            ? rawRoots.split(",").map((x) => x.trim()).filter(Boolean)
            : rootFromSearch.categoryId
              ? [rootFromSearch.categoryId]
              : [];
        return rootFromSearch.categoryId ?? selectedRootIds[0] ?? null;
      })();
      if (!primary) return null;
      const sp = new URLSearchParams(baseSearch);
      const pairsRaw = sp.getAll("topicByRoot").join(",");
      let found: string | null | undefined = undefined;
      if (pairsRaw.trim()) {
        for (const part of pairsRaw.split(",")) {
          const p = part.trim();
          if (!p) continue;
          const idx = p.indexOf(":");
          if (idx <= 0) continue;
          const rootId = p.slice(0, idx).trim();
          const topicKey = p.slice(idx + 1).trim();
          if (rootId !== primary) continue;
          found = topicKey ? topicKey : null;
          break;
        }
      }
      return (found === undefined ? rootFromSearch.topicKey : found) ?? null;
    })(),
    topicEditRootId: (() => {
      const sp = new URLSearchParams(baseSearch);
      const raw = sp.get("categoryIds");
      const ids = raw && raw.trim() ? raw.split(",").map((x) => x.trim()).filter(Boolean) : [];
      if (rootFromSearch.categoryId) return rootFromSearch.categoryId;
      return ids[0] ?? null;
    })(),
    filters: (() => {
      const sp = new URLSearchParams(baseSearch);
      const raw = sp.get("categoryIds");
      const ids = raw && raw.trim() ? raw.split(",").map((x) => x.trim()).filter(Boolean) : [];
      const primary = rootFromSearch.categoryId ?? ids[0] ?? null;
      if (!primary) return {};
      const root = topics.find((t) => t.id === primary) ?? null;
      return root ? parseKnownCompositionSelectionFromSearch({ baseSearch, root }) : {};
    })(),

    regionMode:
      committedScope.mode === "all" ? "all" : committedScope.mode === "city" ? "commit" : "commit",
    radiusKm: initialRadiusKm,
    distanceAll: initialDistanceAll,
  }));

  // NOTE: open 시점에만 category/topic/filters를 URL 기준으로 동기화 (q/price/sort은 draft 의미 유지)
  const lastBaseRef = useRef(baseSearch);
  useEffect(() => {
    if (!open) return;
    if (lastBaseRef.current === baseSearch) return;
    lastBaseRef.current = baseSearch;
    setState((prev) => {
      const rootParsed = parseRootFromSearch(baseSearch);
      const nextRoot = rootParsed.categoryId;
      const sp = new URLSearchParams(baseSearch);
      const raw = sp.get("categoryIds");
      const ids = raw && raw.trim() ? raw.split(",").map((x) => x.trim()).filter(Boolean) : [];
      const nextRootIds = ids.length > 0 ? ids : nextRoot ? [nextRoot] : [];
      const nextPrimary = nextRoot ?? nextRootIds[0] ?? null;
      const rootObj = nextPrimary ? topics.find((t) => t.id === nextPrimary) ?? null : null;
      const topicByRoot: Record<string, string | null> = (() => {
        const selectedSet = new Set(nextRootIds);
        const out: Record<string, string | null> = {};
        const pairsRaw = sp.getAll("topicByRoot").join(",");
        if (pairsRaw.trim()) {
          for (const part of pairsRaw.split(",")) {
            const p = part.trim();
            if (!p) continue;
            const idx = p.indexOf(":");
            if (idx <= 0) continue;
            const rootId = p.slice(0, idx).trim();
            const topicKey = p.slice(idx + 1).trim();
            if (!rootId) continue;
            if (!selectedSet.has(rootId)) continue;
            out[rootId] = topicKey ? topicKey : null;
          }
        }
        // backward compatible: legacy `topic` is the primary-root topic
        if (nextPrimary && rootParsed.topicKey && out[nextPrimary] == null) {
          out[nextPrimary] = rootParsed.topicKey;
        }
        for (const k of Object.keys(out)) {
          if (!selectedSet.has(k)) delete out[k];
        }
        return out;
      })();
      const locScope = parseTradeLocationScopeFromSearchParams(new URLSearchParams(baseSearch));
      return {
        ...prev,
        sort: parseSortFromSearch(baseSearch),
        tradeState: parseTradeStateFromSearch(baseSearch),
        ...parsePriceFromSearch(baseSearch),
        rootCategoryId: nextPrimary,
        rootCategoryIds: nextRootIds,
        topicByRoot,
        topicKey: nextPrimary ? topicByRoot[nextPrimary] ?? null : null,
        topicEditRootId: nextPrimary,
        filters: rootObj ? parseKnownCompositionSelectionFromSearch({ baseSearch, root: rootObj }) : {},
        regionMode: locScope.mode === "all" ? "all" : "commit",
        radiusKm:
          locScope.mode === "city" && locScope.radiusKm != null
            ? locScope.radiusKm
            : TRADE_BROWSE_RECOMMENDED_RADIUS_KM,
        distanceAll:
          locScope.mode === "city"
            ? radiusRaw == null || radiusRaw === ""
            : true,
      };
    });
  }, [open, baseSearch, topics]);

  const rootCategory = state.rootCategoryId
    ? topics.find((t) => t.id === state.rootCategoryId) ?? null
    : null;

  const [children, setChildren] = useState<CategoryWithSettings[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const pickGen = useRef(0);

  useEffect(() => {
    const editRootId = state.topicEditRootId ?? state.rootCategoryId;
    if (!editRootId) {
      setChildren([]);
      return;
    }
    const gen = ++pickGen.current;
    setLoadingChildren(true);
    void getChildCategories(editRootId)
      .then((list) => {
        if (gen !== pickGen.current) return;
        setChildren(list);
      })
      .finally(() => {
        if (gen !== pickGen.current) return;
        setLoadingChildren(false);
      });
  }, [state.topicEditRootId, state.rootCategoryId]);

  const resolvedChild = useMemo(() => {
    if (!state.topicKey) return null;
    if (!state.rootCategoryId) return null;
    if (state.topicEditRootId && state.topicEditRootId !== state.rootCategoryId) return null;
    return children.find((c) => (c.slug?.trim() || c.id) === state.topicKey) ?? null;
  }, [children, state.topicKey, state.rootCategoryId, state.topicEditRootId]);

  const topicEditRootIdEffective = state.topicEditRootId ?? state.rootCategoryId;
  const editingTopicKey = topicEditRootIdEffective ? state.topicByRoot[topicEditRootIdEffective] ?? null : null;

  const composition = useMemo(() => {
    if (!rootCategory) return null;
    return resolveTradeCompositionForCategory(rootCategory);
  }, [rootCategory]);

  const appliedChips: AppliedChip[] = useMemo(() => {
    const chips: AppliedChip[] = [];

    if (rootCategory) {
      const rootLabel = resolveTradeCategoryUILabel(
        language === "en" ? "en" : "ko",
        rootCategory.name,
        rootCategory.name_en,
        rootCategory.slug,
        rootCategory.icon_key
      );
      const extraRoots = Math.max(0, state.rootCategoryIds.length - 1);
      if (resolvedChild) {
        const childLabel = resolveTradeCategoryUILabel(
          language === "en" ? "en" : "ko",
          resolvedChild.name,
          resolvedChild.name_en,
          resolvedChild.slug,
          resolvedChild.icon_key
        );
        chips.push({
          id: "category",
          label: `${rootLabel} · ${childLabel}${extraRoots > 0 ? ` (+${extraRoots})` : ""}`,
        });
      } else {
        chips.push({
          id: "category",
          label: `${rootLabel}${extraRoots > 0 ? ` (+${extraRoots})` : ""}`,
        });
      }
    }

    if (state.regionMode !== "all") {
      if (!state.distanceAll) {
        const km = Math.round(state.radiusKm);
        chips.push({ id: "distance", label: `${km}km` });
      }
    }

    if (state.tradeState === "active") {
      chips.push({
        id: "tradeState",
        label: safeT("marketplace_filter_trade_state_active", {
          fallbackKo: "판매중",
          fallbackEn: "Available",
        }),
      });
    } else if (state.tradeState === "sold") {
      chips.push({
        id: "tradeState",
        label: safeT("marketplace_filter_trade_state_sold", {
          fallbackKo: "판매완료",
          fallbackEn: "Sold",
        }),
      });
    }

    const priceChip = priceChipLabel(state.priceMin, state.priceMax);
    if (priceChip) chips.push({ id: "price", label: priceChip });

    return chips;
  }, [
    rootCategory,
    resolvedChild,
    state.rootCategoryIds,
    state.regionMode,
    state.radiusKm,
    state.tradeState,
    state.priceMin,
    state.priceMax,
    safeT,
    language,
  ]);

  const sortOptions = [
    {
      value: "latest" as SortOption,
      key: "marketplace_filter_sort_latest" as const,
      fallbackKo: "최신순",
      fallbackEn: "Latest",
    },
    {
      value: "near" as SortOption,
      key: "marketplace_filter_sort_distance" as const,
      fallbackKo: "가까운순",
      fallbackEn: "Nearest",
    },
    {
      value: "popular" as SortOption,
      key: "marketplace_filter_sort_popular" as const,
      fallbackKo: "인기순",
      fallbackEn: "Popular",
    },
  ] as const;

  const tradeStateOptions = [
    {
      value: "all" as TradeStateOption,
      key: "marketplace_filter_trade_state_all" as const,
      fallbackKo: "전체",
      fallbackEn: "All",
    },
    {
      value: "active" as TradeStateOption,
      key: "marketplace_filter_trade_state_active" as const,
      fallbackKo: "판매중",
      fallbackEn: "Available",
    },
    {
      value: "sold" as TradeStateOption,
      key: "marketplace_filter_trade_state_sold" as const,
      fallbackKo: "판매완료",
      fallbackEn: "Sold",
    },
  ] as const;

  const regionAllLabel = safeT("trade_location_all", { fallbackKo: "전체", fallbackEn: "All" });
  const otherRegionLabel = safeT("marketplace_filter_region_other", {
    fallbackKo: "다른 지역 선택",
    fallbackEn: "Choose another region",
  });

  const draftCity =
    draftFromLocationPicker?.location?.kind === "city"
      ? draftFromLocationPicker.location
      : null;

  const displayOtherCity =
    state.regionMode === "other" && draftCity?.displayName
      ? draftCity.displayName
      : null;

  function resetAllFiltersCommitted() {
    void buildMarketplaceBrowseResetCommittedHref("/market", baseSearch).then((href) => {
      applyMarketplaceBrowseResetClientEffects();
      onClose();
      router.replace(href, { scroll: false });
    });
  }

  function clearDraft() {
    const cityMode = committedScope.mode === "city";
    setState((prev) => ({
      ...prev,
      sort: "latest",
      tradeState: "all",
      priceMin: "",
      priceMax: "",
      rootCategoryId: null,
      rootCategoryIds: [],
      topicKey: null,
      topicByRoot: {},
      topicEditRootId: null,
      filters: {},
      regionMode: cityMode ? "commit" : "all",
      radiusKm:
        cityMode && committedScope.mode === "city" && committedScope.radiusKm != null
          ? committedScope.radiusKm
          : TRADE_BROWSE_RECOMMENDED_RADIUS_KM,
      distanceAll: true,
    }));
    // on purpose: q is derived from URL baseSearch and never cleared by this sheet
  }

  function removeChip(chip: AppliedChip) {
    setState((prev) => {
      if (chip.id === "category") {
        return {
          ...prev,
          rootCategoryId: null,
          rootCategoryIds: [],
          topicKey: null,
          topicByRoot: {},
          topicEditRootId: null,
          filters: {},
        };
      }
      if (chip.id === "distance") {
        return { ...prev, distanceAll: true, radiusKm: TRADE_BROWSE_RECOMMENDED_RADIUS_KM };
      }
      if (chip.id === "tradeState") {
        return { ...prev, tradeState: "all" };
      }
      if (chip.id === "price") {
        return { ...prev, priceMin: "", priceMax: "" };
      }
      return prev;
    });
  }

  function buildDraftHref(): string {
    const incoming = new URLSearchParams(baseSearch);
    // start from incoming, but remove everything we own (category/topic/options, location/radius, sort, price, tradeState)
    const sp = new URLSearchParams(incoming.toString());

    // pagination reset (new browsing session)
    for (const k of ["page", "cursor"]) sp.delete(k);

    // category axis
    sp.delete("category");
    sp.delete("categoryIds");
    sp.delete("topic");
    sp.delete("topicByRoot");
    for (const fid of knownFieldIds) sp.delete(`filters[${fid}]`);

    // location axis
    sp.delete("location");
    sp.delete("lgu");
    sp.delete(TRADE_LOCATION_RADIUS_PARAM);

    // sort / hard constraints
    sp.delete("sort");
    sp.delete("fs");
    sp.delete("priceMin");
    sp.delete("priceMax");
    sp.delete("tradeState");

    // preserve q
    const q = incoming.get("q");
    if (q) sp.set("q", q);
    else sp.delete("q");

    // sort
    if (state.sort === "near") sp.set("sort", "near");
    else if (state.sort === "popular") sp.set("sort", "popular");

    // price
    const minNum = Number(state.priceMin);
    const maxNum = Number(state.priceMax);
    if (state.priceMin && !Number.isNaN(minNum) && minNum > 0) sp.set("priceMin", String(Math.floor(minNum)));
    if (state.priceMax && !Number.isNaN(maxNum) && maxNum > 0) sp.set("priceMax", String(Math.floor(maxNum)));

    // tradeState
    if (state.tradeState === "active") sp.set("tradeState", "active");
    else if (state.tradeState === "sold") sp.set("tradeState", "sold");

    // location + radius
    if (state.regionMode === "all") {
      sp.set("location", "all");
    } else {
      const canonical =
        state.regionMode === "other" && draftCity?.canonicalId
          ? draftCity.canonicalId
          : committedScope.mode === "city"
            ? committedScope.canonicalId
            : null;
      if (canonical) {
        const radiusToApply = state.distanceAll
          ? null
          : sanitizeTradeBrowseRadiusKm(state.radiusKm);
        const scope = buildTradeCityScopeFromCanonical(canonical, radiusToApply);
        const applied = applyTradeLocationScopeToSearchParams(sp, scope as TradeLocationScope);
        return applyCategoryHrefIfNeeded({ sp: applied, rootCategory });
      }
    }

    return applyCategoryHrefIfNeeded({ sp, rootCategory });
  }

  function applyCategoryHrefIfNeeded(opts: {
    sp: URLSearchParams;
    rootCategory: CategoryWithSettings | null;
  }): string {
    // If no root selected: it's just /market + our non-category params already set.
    if (!state.rootCategoryId || state.rootCategoryIds.length === 0) {
      const qs = opts.sp.toString();
      return qs ? `/market?${qs}` : "/market";
    }

    const primaryRootId = state.rootCategoryId;
    const nextRootIds = [...new Set(state.rootCategoryIds)].filter(Boolean);

    const sp = new URLSearchParams(opts.sp.toString());
    sp.set("category", primaryRootId);
    sp.set("categoryIds", nextRootIds.join(","));

    // ROOT-keyed optional child:
    // - legacy `topic` is still set for the currently edited primary root
    // - root-keyed mapping uses `topicByRoot` for all selected roots that have a topic
    sp.delete("topicByRoot");
    if (state.topicKey) sp.set("topic", state.topicKey);
    else sp.delete("topic");

    for (const rid of nextRootIds) {
      const t = state.topicByRoot?.[rid] ?? null;
      if (!t) continue;
      sp.append("topicByRoot", `${rid}:${t}`);
    }

    if (opts.rootCategory) {
      const composition = resolveTradeCompositionForCategory(opts.rootCategory);
      const sanitizedFilters = sanitizeCompositionFilterSelection(state.filters, composition);
      appendCompositionFilterSearchParams(sp, sanitizedFilters);
    }

    const qs = sp.toString();
    return qs ? `/market?${qs}` : "/market";
  }

  function applyResults() {
    const href = buildDraftHref();
    onClose();
    router.replace(href, { scroll: false });
  }

  const distanceOptions: Array<{ value: "all" | number; label: string }> = [
    { value: "all", label: regionAllLabel },
    { value: 5, label: "5km" },
    { value: 10, label: "10km" },
    { value: 30, label: "30km" },
    { value: 64, label: "64km" },
  ];

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={safeT("marketplace_filter_sheet_title", {
        fallbackKo: "필터 및 정렬",
        fallbackEn: "Filter & Sort",
      })}
      footer={
        <DibayOverlayButton roleTone="primary" onClick={applyResults}>
          {safeT("marketplace_filter_view_results", {
            fallbackKo: "결과 보기",
            fallbackEn: "View results",
          })}
        </DibayOverlayButton>
      }
    >
      <div className="flex flex-col gap-6 px-4 py-3">
        {appliedChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className={Sam.text.helper}>
              {safeT("marketplace_filter_applied", { fallbackKo: "적용된 필터", fallbackEn: "Applied filters" })}
            </span>
            {appliedChips.map((chip, idx) => (
              <button
                key={`${chip.id}:${chip.label}:${idx}`}
                type="button"
                className="inline-flex items-center rounded-full border border-sam-border bg-sam-surface px-2.5 py-0.5 text-sm text-sam-fg active:scale-[0.98]"
                onClick={() => removeChip(chip)}
                aria-label={`${chip.label} ${safeT("common_close", { fallbackKo: "닫기", fallbackEn: "Close" })}`}
              >
                {chip.label}
                <span className="ml-1 text-sm text-sam-fg-muted" aria-hidden>
                  ×
                </span>
              </button>
            ))}
            <button
              type="button"
              className="ml-auto inline-flex h-8 items-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-xs font-medium text-sam-fg active:scale-[0.98]"
              onClick={resetAllFiltersCommitted}
            >
              {safeT("marketplace_filter_clear_all", { fallbackKo: "전체 초기화", fallbackEn: "Reset all" })}
            </button>
          </div>
        ) : null}

        {/* Category */}
        <FilterSection
          label={safeT("marketplace_more_categories_title", { fallbackKo: "카테고리", fallbackEn: "Categories" })}
        >
          <RadioItem
            checked={state.rootCategoryIds.length === 0}
            label={safeT("marketplace_filter_category_all", { fallbackKo: "전체", fallbackEn: "All" })}
            onChange={() => {
              setState((s) => ({
                ...s,
                rootCategoryId: null,
                rootCategoryIds: [],
                topicKey: null,
                topicByRoot: {},
                topicEditRootId: null,
                filters: {},
              }));
            }}
          />
          {topics.map((cat) => (
            <CheckboxItem
              key={cat.id}
              checked={state.rootCategoryIds.includes(cat.id)}
              label={resolveTradeCategoryUILabel(
                language === "en" ? "en" : "ko",
                cat.name,
                cat.name_en,
                cat.slug,
                cat.icon_key
              )}
              onChange={() => {
                setState((s) => {
                  const has = s.rootCategoryIds.includes(cat.id);
                  if (!has) {
                    const nextRootIds = [...s.rootCategoryIds, cat.id];
                    // add non-primary root: keep existing topic/filters on current primary
                    return {
                      ...s,
                      rootCategoryIds: nextRootIds,
                      rootCategoryId: s.rootCategoryId ?? cat.id,
                      topicKey: s.rootCategoryId ? s.topicKey : s.topicByRoot[cat.id] ?? null,
                      topicEditRootId: s.rootCategoryId ? s.topicEditRootId : cat.id,
                    };
                  }
                  const nextRootIds = s.rootCategoryIds.filter((id) => id !== cat.id);
                  const nextTopicByRoot = { ...s.topicByRoot };
                  delete nextTopicByRoot[cat.id];
                  if (s.rootCategoryId === cat.id) {
                    // removing primary root: reset primary-scoped topic/filters
                    const nextPrimary = nextRootIds[0] ?? null;
                    return {
                      ...s,
                      rootCategoryIds: nextRootIds,
                      rootCategoryId: nextPrimary,
                      topicByRoot: nextTopicByRoot,
                      topicKey: nextPrimary ? nextTopicByRoot[nextPrimary] ?? null : null,
                      topicEditRootId: nextPrimary,
                      filters: {},
                    };
                  }
                  // removing non-primary root: keep primary-scoped topic/filters
                  return {
                    ...s,
                    rootCategoryIds: nextRootIds,
                    topicByRoot: nextTopicByRoot,
                    topicEditRootId: s.topicEditRootId === cat.id ? s.rootCategoryId : s.topicEditRootId,
                  };
                });
              }}
            />
          ))}
        </FilterSection>

        {state.rootCategoryId ? (
          <div className="flex flex-col gap-4">
            {/* Child categories (topic) */}
            {(loadingChildren || children.length > 0) ? (
              <div>
                <p className={`${Sam.text.helper} font-medium`}>
                  {safeT("marketplace_more_browse_category_title", {
                    fallbackKo: "카테고리",
                    fallbackEn: "Category",
                  })}
                </p>
                {state.rootCategoryIds.length > 1 ? (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                    {state.rootCategoryIds.map((rid) => {
                      const r = topics.find((t) => t.id === rid) ?? null;
                      if (!r) return null;
                      return (
                        <RadioItem
                          key={rid}
                          checked={topicEditRootIdEffective === rid}
                          label={resolveTradeCategoryUILabel(
                            language === "en" ? "en" : "ko",
                            r.name,
                            r.name_en,
                            r.slug,
                            r.icon_key
                          )}
                          onChange={() => setState((s) => ({ ...s, topicEditRootId: rid }))}
                        />
                      );
                    })}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                  <RadioItem
                    checked={!editingTopicKey}
                    label={safeT("marketplace_more_browse_all_in_topic", {
                      fallbackKo: "이 주제 전체",
                      fallbackEn: "All in this topic",
                    })}
                    onChange={() =>
                      setState((s) => {
                        const rid = s.topicEditRootId ?? s.rootCategoryId;
                        if (!rid) return s;
                        return {
                          ...s,
                          topicKey: s.rootCategoryId === rid ? null : s.topicKey,
                          topicByRoot: { ...s.topicByRoot, [rid]: null },
                        };
                      })
                    }
                  />
                  {loadingChildren ? (
                    <div className="text-sm text-sam-fg-muted">
                      {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
                    </div>
                  ) : (
                    children.map((child) => (
                      <RadioItem
                        key={child.id}
                        checked={editingTopicKey === (child.slug?.trim() || child.id)}
                        label={resolveTradeCategoryUILabel(
                          language === "en" ? "en" : "ko",
                          child.name,
                          child.name_en,
                          child.slug,
                          child.icon_key
                        )}
                        onChange={() =>
                          setState((s) => {
                            const rid = s.topicEditRootId ?? s.rootCategoryId;
                            if (!rid) return s;
                            const next = child.slug?.trim() || child.id;
                            return {
                              ...s,
                              topicKey: s.rootCategoryId === rid ? next : s.topicKey,
                              topicByRoot: { ...s.topicByRoot, [rid]: next },
                            };
                          })
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {/* Options */}
            {composition && rootCategory && marketplaceMoreBrowseHasFilterOptions(rootCategory) ? (
              <div className="flex flex-col gap-2">
                <p className={`${Sam.text.helper} font-medium`}>{safeT("marketplace_more_browse_options_title", { fallbackKo: "품목 옵션", fallbackEn: "Item options" })}</p>
                <div className="flex flex-col gap-2">
                  <CompositionAttributeFilterSelects
                    composition={composition}
                    selection={state.filters}
                    onChange={(next) => setState((s) => ({ ...s, filters: next }))}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Region */}
        <FilterSection
          label={safeT("trade_location_section_region", { fallbackKo: "지역", fallbackEn: "Area" })}
        >
          <RegionRadio
            checked={state.regionMode === "commit"}
            label={
              myRegionCommitLabel ??
              safeT("trade_location_resolving_city", {
                fallbackKo: "지역 확인 중…",
                fallbackEn: "Finding city…",
              })
            }
            onSelect={() => setState((s) => ({ ...s, regionMode: "commit" }))}
          />
          <RegionRadio
            checked={state.regionMode === "all"}
            label={regionAllLabel}
            onSelect={() => setState((s) => ({ ...s, regionMode: "all" }))}
          />
          <RegionRadio
            checked={state.regionMode === "other"}
            label={displayOtherCity ? `${displayOtherCity}` : otherRegionLabel}
            onSelect={() => {
              // choose another region via existing picker (draft-session only on back)
              setState((s) => ({ ...s, regionMode: "other" }));
              onClose();
              const q = baseSearch.trim();
              router.push(q ? `/market/location?${q}` : "/market/location");
            }}
          />
        </FilterSection>

        {/* Distance */}
        <FilterSection
          label={safeT("trade_location_distance_title", { fallbackKo: "거리 설정", fallbackEn: "Set distance" })}
        >
          {distanceOptions.map((opt) => (
            <RadioItem
              key={opt.label}
              checked={
                opt.value === "all"
                  ? state.regionMode === "all" || state.distanceAll
                  : !state.distanceAll && state.radiusKm === opt.value
              }
              label={opt.label}
              onChange={() => {
                setState((s) => {
                  if (opt.value === "all") {
                    return { ...s, distanceAll: true, radiusKm: TRADE_BROWSE_RECOMMENDED_RADIUS_KM };
                  }
                  return {
                    ...s,
                    distanceAll: false,
                    radiusKm: opt.value,
                    regionMode: s.regionMode === "all" ? "commit" : s.regionMode,
                  };
                });
              }}
            />
          ))}
        </FilterSection>

        {/* Sort */}
        <FilterSection label={safeT("marketplace_filter_sort_label", { fallbackKo: "정렬", fallbackEn: "Sort by" })}>
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
        <FilterSection label={safeT("marketplace_filter_price_label", { fallbackKo: "가격", fallbackEn: "Price" })}>
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
        <FilterSection label={safeT("marketplace_filter_trade_state_label", { fallbackKo: "판매 상태", fallbackEn: "Trade status" })}>
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
      <input type="radio" className="h-4 w-4 accent-sam-brand" checked={checked} onChange={onChange} />
      <span className="text-sm text-sam-fg">{label}</span>
    </label>
  );
}

function CheckboxItem({
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
      <input type="checkbox" className="h-4 w-4 accent-sam-brand" checked={checked} onChange={onChange} />
      <span className="text-sm text-sam-fg">{label}</span>
    </label>
  );
}

function RegionRadio({
  checked,
  label,
  onSelect,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="radio" className="h-4 w-4 accent-sam-brand" checked={checked} onChange={onSelect} />
      <span className="text-sm text-sam-fg">{label}</span>
    </label>
  );
}
