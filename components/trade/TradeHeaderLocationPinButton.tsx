"use client";

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
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
  peekTradeLguDisplayLabel,
  rememberTradeLguDisplayLabel,
  tradeLocationScopeEquals,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";
import {
  cloneTradeBrowseLocation,
  tradeBrowseLocationFromScope,
  tradeBrowseLocationToScope,
  type TradeBrowseLocation,
} from "@/lib/trade/location/trade-browse-location";
import { TradeBrowseLocationSheet } from "@/components/trade/TradeBrowseLocationSheet";

async function resolveMasterNationalLgu(addr: UserAddressDTO): Promise<{
  canonicalId: string;
  displayName: string;
} | null> {
  const cityMunicipality = (addr.cityMunicipality ?? "").trim();
  const province = (addr.province ?? "").trim();
  if (!cityMunicipality) return null;
  try {
    const sp = new URLSearchParams({ mode: "resolve", cityMunicipality });
    if (province) sp.set("province", province);
    const res = await fetch(`/api/trade/national-lgu?${sp.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      resolution?: {
        status?: string;
        canonicalId?: string;
        lgu?: { displayName?: string; canonicalId?: string };
      };
    };
    if (json.resolution?.status !== "resolved") return null;
    const canonicalId =
      (typeof json.resolution.canonicalId === "string" && json.resolution.canonicalId) ||
      (typeof json.resolution.lgu?.canonicalId === "string" && json.resolution.lgu.canonicalId) ||
      "";
    const displayName =
      (typeof json.resolution.lgu?.displayName === "string" &&
        json.resolution.lgu.displayName.trim()) ||
      "";
    if (!canonicalId || !displayName) return null;
    return { canonicalId, displayName };
  } catch {
    return null;
  }
}

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
  mode: "all" | "city";
  cityLabel: string | null;
  radiusKm: number | null;
  userPlaceLabel: string | null;
  allLabel: string;
  fallbackPlaceLabel: string;
}): { place: string | null; suffix: string } {
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

export type TradeHeaderLocationPinPlacement = "icon-cluster" | "beside-title";

/**
 * Trade header MapPin — Marketplace buyer browse location.
 * `beside-title`: 거래 제목 우측 (녹색 핀 + 주소 · 전체|Nkm)
 * `icon-cluster`: 우측 아이콘 열 (레거시)
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [sheetSeed, setSheetSeed] = useState<TradeBrowseLocation>({ kind: "all" });
  const [myRegion, setMyRegion] = useState<{
    canonicalId: string;
    displayName: string;
  } | null>(null);
  const [myRegionLoading, setMyRegionLoading] = useState(false);
  const [committedLabel, setCommittedLabel] = useState<string | null>(null);

  const committedScope = parseTradeLocationScopeFromSearchParams(searchParams);
  const isFiltered = committedScope.mode === "city";

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

  const loadMyRegion = useCallback(async () => {
    setMyRegionLoading(true);
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({
        caller: "trade_location_scope",
        reason: "trade_location_panel",
      });
      const master = coerceUserAddressDTO(snapshot?.defaults?.master ?? null);
      if (!master?.id) {
        setMyRegion(null);
        return;
      }
      const national = await resolveMasterNationalLgu(master);
      if (!national) {
        setMyRegion(null);
        return;
      }
      rememberTradeLguDisplayLabel(national.canonicalId, national.displayName);
      setMyRegion(national);
    } catch {
      setMyRegion(null);
    } finally {
      setMyRegionLoading(false);
    }
  }, []);

  /** Header needs master place for `주소 · 전체` even before sheet open. */
  useEffect(() => {
    void loadMyRegion();
  }, [loadMyRegion]);

  const openSheet = useCallback(() => {
    if (typeof performance !== "undefined" && performance.mark) {
      performance.mark("trade_browse_loc_pin_tap");
    }
    setSheetSeed(cloneTradeBrowseLocation(committedBrowse));
    setOpen(true);
    if (typeof performance !== "undefined" && performance.mark) {
      performance.mark("trade_browse_loc_sheet_mount");
    }
    void loadMyRegion();
  }, [committedBrowse, loadMyRegion]);

  const closeSheet = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus?.();
  }, []);

  const commitScope = useCallback(
    (next: TradeLocationScope, label?: string | null) => {
      if (next.mode === "city" && label) {
        rememberTradeLguDisplayLabel(next.canonicalId, label);
        setCommittedLabel(label);
      }
      if (tradeLocationScopeEquals(next, committedScope)) {
        closeSheet();
        return;
      }
      const href = buildTradeLocationHref(pathname, searchParams.toString(), next);
      router.replace(href, { scroll: false });
      closeSheet();
    },
    [closeSheet, committedScope, pathname, router, searchParams]
  );

  const onApply = useCallback(
    (draft: TradeBrowseLocation) => {
      if (draft.kind !== "city") return;
      const scope = tradeBrowseLocationToScope(draft);
      commitScope(scope, draft.displayName);
    },
    [commitScope]
  );

  const onViewAll = useCallback(() => {
    commitScope({ mode: "all" });
  }, [commitScope]);

  const hintParts = buildTradeHeaderLocationHintParts({
    mode: committedScope.mode === "city" ? "city" : "all",
    cityLabel: committedLabel,
    radiusKm: committedScope.mode === "city" ? committedScope.radiusKm : null,
    userPlaceLabel: myRegion?.displayName ?? null,
    allLabel: t("trade_location_all"),
    fallbackPlaceLabel: t("trade_location_section_region"),
  });

  const headerHintAria = hintParts.place
    ? `${hintParts.place} · ${hintParts.suffix}`
    : hintParts.suffix;

  const ariaLabel = `${t("trade_location_pin_aria")}: ${headerHintAria}`;

  const besideTitle = placement === "beside-title";

  const hintTextClass =
    "text-[11px] font-semibold leading-[22px] text-sam-fg";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={
          besideTitle
            ? `inline-flex max-w-[min(62vw,15.5rem)] min-w-0 shrink items-center gap-1 self-center rounded-ui-rect px-1 py-0 text-left ${samTier1HeaderIconMicro}`
            : `${SAM_TIER1_HEADER_ACTION_BTN_CLASS} relative ${
                isFiltered ? "text-sam-primary" : ""
              }`
        }
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) closeSheet();
          else openSheet();
        }}
      >
        <MapPin
          className={
            besideTitle
              ? "h-[18px] w-[18px] shrink-0 text-sam-primary"
              : `${SAM_TIER1_HEADER_ICON_GLYPH_CLASS} text-sam-primary`
          }
          strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
          fill="currentColor"
          fillOpacity={0.18}
          aria-hidden
        />
        {besideTitle ? (
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

      <TradeBrowseLocationSheet
        open={open}
        onClose={closeSheet}
        initialDraft={sheetSeed}
        myRegion={myRegion}
        myRegionLoading={myRegionLoading}
        onApply={onApply}
        onViewAll={onViewAll}
      />
    </>
  );
}
