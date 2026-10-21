"use client";

import { TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS } from "@/lib/trade/location/use-trade-marketplace-location-hydrate";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  SAM_TIER1_HEADER_ACTION_BTN_CLASS,
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
  SAM_TIER1_HEADER_ICON_STROKE_WIDTH,
  samTier1HeaderIconMicro,
} from "@/lib/ui/tier1-header-icon";
import { loadTradeBrowseMyRegion } from "@/components/trade/location/use-trade-browse-my-region";
import { useSingleNavigationGuard } from "@/components/trade/location/use-single-navigation-guard";
import {
  parseTradeLocationScopeFromSearchParams,
  peekTradeLguDisplayLabel,
  rememberTradeLguDisplayLabel,
} from "@/lib/trade/location/trade-location-scope";
import {
  tradeBrowseLocationFromScope,
} from "@/lib/trade/location/trade-browse-location";
import {
  defaultTradeBrowseRadiusSelection,
  tradeBrowseRadiusSelectionFromKm,
} from "@/lib/trade/location/trade-browse-radius";
import { seedTradeBrowseLocationDraftSession } from "@/lib/trade/location/trade-browse-location-draft-session";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import {
  TRADE_BROWSE_LOCATION_PATH,
  isTradeBrowseLocationPath,
} from "@/lib/trade/location/trade-browse-location-paths";

async function fetchNationalLguLabel(canonicalId: string): Promise<string | null> {
  const cached = peekTradeLguDisplayLabel(canonicalId);
  if (cached) return cached;
  try {
    const res = await fetch(`/api/trade/national-lgu?id=${encodeURIComponent(canonicalId)}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { item?: { displayName?: string } };
    const name = json.item?.displayName?.trim() ?? "";
    if (!name) return null;
    rememberTradeLguDisplayLabel(canonicalId, name);
    return name;
  } catch {
    return null;
  }
}

/** Header hint: `{place} · {전체|Nkm}` — place truncates; suffix must never clip. */
export function buildTradeHeaderLocationHintParts(input: {
  mode: "all" | "city" | "unset" | "invalid";
  cityLabel: string | null;
  radiusKm: number | null;
  userPlaceLabel: string | null;
  allLabel: string;
  fallbackPlaceLabel: string;
  invalidLabel?: string;
}): { place: string | null; suffix: string } {
  if (input.mode === "unset") {
    return { place: null, suffix: input.allLabel };
  }
  if (input.mode === "invalid") {
    return { place: null, suffix: input.invalidLabel ?? input.fallbackPlaceLabel };
  }
  if (input.mode === "city") {
    const place = (input.cityLabel ?? "").trim() || input.fallbackPlaceLabel;
    const km =
      typeof input.radiusKm === "number" && Number.isFinite(input.radiusKm)
        ? Math.round(input.radiusKm)
        : null;
    return { place, suffix: km != null ? `${km}km` : input.allLabel };
  }
  const place = (input.userPlaceLabel ?? "").trim() || null;
  return { place, suffix: input.allLabel };
}

/** 나의 지역 일시 실패 시 유한 재시도 — hydrate 정책과 같은 간격(단일 정의). */
const MY_REGION_RETRY_DELAYS_MS = TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS;

export type TradeHeaderLocationPinPlacement = "icon-cluster" | "beside-title" | "below-title";

/**
 * Trade header MapPin — opens `/market/location` page stack (not bottom sheet).
 */
export function TradeHeaderLocationPinButton({
  placement = "icon-cluster",
}: {
  placement?: TradeHeaderLocationPinPlacement;
} = {}) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "/market";
  const searchParams = useSearchParams();
  const router = useRouter();
  const [myRegion, setMyRegion] = useState<{
    canonicalId: string;
    displayName: string;
  } | null>(null);
  const [committedLabel, setCommittedLabel] = useState<string | null>(null);

  const committedScope = parseTradeLocationScopeFromSearchParams(searchParams);
  const isFiltered = committedScope.mode === "city";
  const locationUnset = committedScope.mode === "unset";
  const onLocationStack = isTradeBrowseLocationPath(pathname);

  const committedBrowse = useMemo(
    () => tradeBrowseLocationFromScope(committedScope, committedLabel),
    [committedScope, committedLabel]
  );

  useEffect(() => {
    if (committedScope.mode !== "city") {
      setCommittedLabel(null);
      return;
    }
    const peek = peekTradeLguDisplayLabel(committedScope.canonicalId);
    if (peek) {
      setCommittedLabel(peek);
      return;
    }
    let cancelled = false;
    void fetchNationalLguLabel(committedScope.canonicalId).then((name) => {
      if (!cancelled) setCommittedLabel(name);
    });
    return () => {
      cancelled = true;
    };
  }, [committedScope]);

  const myRegionRetryTimerRef = useRef<number | null>(null);
  const myRegionGenRef = useRef(0);

  /**
   * 일시 실패(네트워크·5xx)는 「대표주소 없음」으로 지우지 않고 마지막 값을 유지한 채
   * 유한 재시도(1s·2s·4s). 대표주소 없음·LGU 미해결만 null.
   */
  const loadMyRegion = useCallback(async () => {
    const gen = ++myRegionGenRef.current;
    if (myRegionRetryTimerRef.current != null) {
      window.clearTimeout(myRegionRetryTimerRef.current);
      myRegionRetryTimerRef.current = null;
    }
    for (let attempt = 0; ; attempt += 1) {
      const result = await loadTradeBrowseMyRegion();
      if (gen !== myRegionGenRef.current) return;
      if (result.status === "ready") {
        setMyRegion(result.region);
        return;
      }
      if (result.status === "missing") {
        setMyRegion(null);
        return;
      }
      const delay = MY_REGION_RETRY_DELAYS_MS[attempt];
      if (delay == null) return;
      await new Promise<void>((resolve) => {
        myRegionRetryTimerRef.current = window.setTimeout(() => {
          myRegionRetryTimerRef.current = null;
          resolve();
        }, delay);
      });
      if (gen !== myRegionGenRef.current) return;
    }
  }, []);

  useEffect(() => {
    void loadMyRegion();
    return () => {
      myRegionGenRef.current += 1;
      if (myRegionRetryTimerRef.current != null) {
        window.clearTimeout(myRegionRetryTimerRef.current);
        myRegionRetryTimerRef.current = null;
      }
    };
  }, [loadMyRegion]);

  useEffect(() => {
    const onAddressesUpdated = () => {
      void loadMyRegion();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [loadMyRegion]);

  const openLocationPage = useCallback(() => {
    // 이미 위치 화면이면 같은 화면을 history 에 또 쌓거나 작성 중 초안을 덮지 않는다
    if (pathname === TRADE_BROWSE_LOCATION_PATH) return;
    if (typeof performance !== "undefined" && performance.mark) {
      performance.mark("trade_browse_loc_pin_tap");
    }
    const radius =
      committedBrowse.kind === "city" && typeof committedBrowse.radiusKm === "number"
        ? tradeBrowseRadiusSelectionFromKm(committedBrowse.radiusKm)
        : defaultTradeBrowseRadiusSelection();
    seedTradeBrowseLocationDraftSession(committedBrowse, radius);
    const q = searchParams.toString();
    const href = q ? `${TRADE_BROWSE_LOCATION_PATH}?${q}` : TRADE_BROWSE_LOCATION_PATH;
    router.push(href);
  }, [committedBrowse, pathname, router, searchParams]);

  const navigateOnce = useSingleNavigationGuard();
  const onPinClick = useCallback(() => {
    navigateOnce(openLocationPage);
  }, [navigateOnce, openLocationPage]);

  const hintParts = buildTradeHeaderLocationHintParts({
    mode:
      committedScope.mode === "city"
        ? "city"
        : committedScope.mode === "unset"
          ? "unset"
          : committedScope.mode === "invalid"
            ? "invalid"
            : "all",
    cityLabel: committedLabel,
    radiusKm: committedScope.mode === "city" ? committedScope.radiusKm : null,
    userPlaceLabel: myRegion?.displayName ?? null,
    allLabel: locationUnset ? t("trade_location_resolving_city") : t("trade_location_all"),
    fallbackPlaceLabel: t("trade_location_section_region"),
    invalidLabel: t("trade_location_invalid"),
  });

  const headerHintAria = hintParts.place
    ? `${hintParts.place} · ${hintParts.suffix}`
    : hintParts.suffix;

  const ariaLabel = `${t("trade_location_pin_aria")}: ${headerHintAria}`;

  const besideTitle = placement === "beside-title";
  const belowTitle = placement === "below-title";
  const showInlineHint = besideTitle || belowTitle;

  const hintTextClass = belowTitle
    ? "text-[13px] font-semibold leading-5 text-sam-fg"
    : "text-[11px] font-semibold leading-[22px] text-sam-fg";

  return (
    <button
      type="button"
      className={
        belowTitle
          ? `inline-flex max-w-full min-w-0 items-center gap-1 rounded-ui-rect py-0.5 text-left ${samTier1HeaderIconMicro}`
          : besideTitle
            ? `inline-flex max-w-[min(62vw,15.5rem)] min-w-0 shrink items-center gap-1 self-center rounded-ui-rect px-1 py-0 text-left ${samTier1HeaderIconMicro}`
            : `${SAM_TIER1_HEADER_ACTION_BTN_CLASS} relative ${
                isFiltered ? "text-sam-primary" : ""
              }`
      }
      aria-label={ariaLabel}
      aria-current={onLocationStack ? "page" : undefined}
      onClick={onPinClick}
    >
      <MapPin
        className={
          showInlineHint
            ? "h-[18px] w-[18px] shrink-0 text-sam-primary"
            : `${SAM_TIER1_HEADER_ICON_GLYPH_CLASS} text-sam-primary`
        }
        strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
        fill="currentColor"
        fillOpacity={0.18}
        aria-hidden
      />
      {showInlineHint ? (
        <span className={`flex min-w-0 items-center gap-1 ${hintTextClass}`}>
          {hintParts.place ? (
            <>
              <span className="min-w-0 truncate">{hintParts.place}</span>
              <span className="shrink-0 text-sam-fg-muted" aria-hidden>
                ·
              </span>
              <span className="shrink-0 text-sam-primary">{hintParts.suffix}</span>
            </>
          ) : (
            <span className="shrink-0 text-sam-primary">{hintParts.suffix}</span>
          )}
        </span>
      ) : hintParts.place || isFiltered ? (
        <span className="absolute -bottom-0.5 left-1/2 flex max-w-[7.5rem] -translate-x-1/2 items-center gap-0.5 text-[9px] font-semibold leading-none text-sam-primary">
          {hintParts.place ? (
            <>
              <span className="min-w-0 truncate">{hintParts.place}</span>
              <span className="shrink-0">· {hintParts.suffix}</span>
            </>
          ) : (
            <span className="shrink-0">{hintParts.suffix}</span>
          )}
        </span>
      ) : null}
    </button>
  );
}
