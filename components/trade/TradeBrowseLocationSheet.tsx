"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { LocateFixed, Pencil, Search } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DibayBottomSheet,
  DibayOverlayButton,
  DibayOverlayActions,
} from "@/components/ui/dibay-overlay";
import { MapPicker, MAP_PICKER_DEFAULT_CENTER } from "@/components/map/MapPicker";
import {
  TradeLocationNationalPicker,
  type TradeNationalPickerHit,
} from "@/components/trade/TradeLocationNationalPicker";
import { getBestCurrentPosition } from "@/lib/map/geolocation";
import { geocodeDisplayLineToLatLng } from "@/lib/map/geocode-display-line-to-lat-lng";
import {
  TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL,
  resolveCanonicalToLegacyProductAlias,
} from "@/lib/trade/location/national/legacy-product-alias-canonical";
import { resolveTradeLguNearbyCities } from "@/lib/trade/location/trade-lgu-adjacency";
import { resolveBrowseLguFromLatLng } from "@/lib/trade/location/resolve-browse-lgu-from-lat-lng";
import {
  cloneTradeBrowseLocation,
  type TradeBrowseLocation,
} from "@/lib/trade/location/trade-browse-location";
import { getTradeLguCityDef } from "@/lib/trade/location/trade-lgu-city-rollup";

type SheetView = "main" | "search";

export type TradeBrowseLocationSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Snapshot when sheet opened — discard target on X */
  initialDraft: TradeBrowseLocation;
  myRegion: { canonicalId: string; displayName: string } | null;
  myRegionLoading: boolean;
  onApply: (draft: TradeBrowseLocation) => void;
  onViewAll: () => void;
};

function draftMapCenter(draft: TradeBrowseLocation): { lat: number; lng: number } {
  if (draft.kind === "city" && typeof draft.lat === "number" && typeof draft.lng === "number") {
    return { lat: draft.lat, lng: draft.lng };
  }
  return MAP_PICKER_DEFAULT_CENTER;
}

function draftLabel(draft: TradeBrowseLocation, allLabel: string): string {
  if (draft.kind === "all") return allLabel;
  return draft.displayName;
}

function nearbyAnchorLegacyId(draft: TradeBrowseLocation, myCanonicalId: string | null): string | null {
  if (draft.kind === "city") {
    return resolveCanonicalToLegacyProductAlias(draft.canonicalId);
  }
  if (myCanonicalId) return resolveCanonicalToLegacyProductAlias(myCanonicalId);
  return null;
}

/**
 * Marketplace-style buyer browse location sheet (Phase 2).
 * Draft-only selections until Apply / 전체 상품 보기. No radius.
 */
export function TradeBrowseLocationSheet({
  open,
  onClose,
  initialDraft,
  myRegion,
  myRegionLoading,
  onApply,
  onViewAll,
}: TradeBrowseLocationSheetProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [view, setView] = useState<SheetView>("main");
  const [draft, setDraft] = useState<TradeBrowseLocation>(() => cloneTradeBrowseLocation(initialDraft));
  const [mapPin, setMapPin] = useState(MAP_PICKER_DEFAULT_CENTER);
  const [mapReady, setMapReady] = useState(false);
  const [mapEdit, setMapEdit] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const openGen = useRef(0);
  const mapMountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      setView("main");
      setMapReady(false);
      setMapEdit(false);
      setGeoBusy(false);
      setGeoError(null);
      setPinBusy(false);
      if (mapMountTimer.current) {
        clearTimeout(mapMountTimer.current);
        mapMountTimer.current = null;
      }
      return;
    }
    openGen.current += 1;
    const gen = openGen.current;
    setDraft(cloneTradeBrowseLocation(initialDraft));
    setMapPin(draftMapCenter(initialDraft));
    setView("main");
    setMapEdit(false);
    setGeoError(null);
    setMapReady(false);
    // Shell first — map hydrates after paint (do not block open).
    mapMountTimer.current = setTimeout(() => {
      if (gen === openGen.current) setMapReady(true);
    }, 0);
    return () => {
      if (mapMountTimer.current) {
        clearTimeout(mapMountTimer.current);
        mapMountTimer.current = null;
      }
    };
  }, [open, initialDraft]);

  // Geocode city label → map center when coords missing (async, non-blocking).
  useEffect(() => {
    if (!open || draft.kind !== "city") return;
    if (typeof draft.lat === "number" && typeof draft.lng === "number") return;
    const gen = openGen.current;
    const name = draft.displayName;
    let cancelled = false;
    void (async () => {
      const hit = await geocodeDisplayLineToLatLng(`${name}, Philippines`);
      if (cancelled || gen !== openGen.current || !hit) return;
      setDraft((prev) => {
        if (prev.kind !== "city" || prev.displayName !== name) return prev;
        if (typeof prev.lat === "number" && typeof prev.lng === "number") return prev;
        return { ...prev, lat: hit.lat, lng: hit.lng };
      });
      setMapPin({ lat: hit.lat, lng: hit.lng });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, draft]);

  const nearby = useMemo(() => {
    const anchor = nearbyAnchorLegacyId(draft, myRegion?.canonicalId ?? null);
    return resolveTradeLguNearbyCities(anchor, {
      excludeLguId: anchor,
      limit: 4,
    });
  }, [draft, myRegion?.canonicalId]);

  const setCityDraft = useCallback(
    (canonicalId: string, displayName: string, coords?: { lat: number; lng: number }) => {
      setDraft({
        kind: "city",
        canonicalId,
        displayName,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      });
      if (coords) setMapPin(coords);
      setGeoError(null);
    },
    []
  );

  const onNationalSelect = useCallback(
    (hit: TradeNationalPickerHit) => {
      setCityDraft(hit.canonicalId, hit.displayName);
      setView("main");
    },
    [setCityDraft]
  );

  const onPickNearby = useCallback(
    (legacyId: string, displayName: string) => {
      const cid =
        TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL[
          legacyId as keyof typeof TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL
        ] ?? null;
      if (!cid) return;
      const def = getTradeLguCityDef(legacyId);
      setCityDraft(cid, def?.displayName ?? displayName);
    },
    [setCityDraft]
  );

  const onMyRegion = useCallback(() => {
    if (!myRegion) return;
    setCityDraft(myRegion.canonicalId, myRegion.displayName);
  }, [myRegion, setCityDraft]);

  const onDeviceLocation = useCallback(async () => {
    setGeoBusy(true);
    setGeoError(null);
    try {
      const pos = await getBestCurrentPosition();
      if (!pos.ok) {
        setGeoError(pos.message || t("trade_location_geo_failed"));
        return;
      }
      const resolved = await resolveBrowseLguFromLatLng(pos.latitude, pos.longitude);
      if (!resolved.ok) {
        setGeoError(t("trade_location_geo_city_unresolved"));
        setMapPin({ lat: pos.latitude, lng: pos.longitude });
        setDraft((prev) =>
          prev.kind === "city"
            ? { ...prev, lat: pos.latitude, lng: pos.longitude }
            : prev
        );
        setMapEdit(true);
        return;
      }
      setCityDraft(resolved.canonicalId, resolved.displayName, {
        lat: resolved.lat,
        lng: resolved.lng,
      });
    } finally {
      setGeoBusy(false);
    }
  }, [setCityDraft, t]);

  const onMapPinChange = useCallback(
    async (pos: { lat: number; lng: number }) => {
      setMapPin(pos);
      setDraft((prev) => {
        if (prev.kind !== "city") return prev;
        return { ...prev, lat: pos.lat, lng: pos.lng };
      });
      setPinBusy(true);
      setGeoError(null);
      try {
        const resolved = await resolveBrowseLguFromLatLng(pos.lat, pos.lng);
        if (!resolved.ok) {
          setGeoError(t("trade_location_geo_city_unresolved"));
          return;
        }
        setCityDraft(resolved.canonicalId, resolved.displayName, {
          lat: resolved.lat,
          lng: resolved.lng,
        });
      } finally {
        setPinBusy(false);
      }
    },
    [setCityDraft, t]
  );

  const canApply =
    draft.kind === "city" && !!draft.canonicalId.trim() && !!draft.displayName.trim();

  const mapCenter = mapPin;

  if (view === "search") {
    return (
      <DibayBottomSheet
        open={open}
        onClose={onClose}
        anchor="above-bottom-nav"
        ariaLabel={t("trade_location_sheet_title")}
        panelClassName="flex max-h-[min(90dvh,640px)] flex-col"
      >
        <TradeLocationNationalPicker
          selectedCanonicalId={draft.kind === "city" ? draft.canonicalId : null}
          onSelect={onNationalSelect}
          onBack={() => setView("main")}
        />
      </DibayBottomSheet>
    );
  }

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      anchor="above-bottom-nav"
      ariaLabel={t("trade_location_sheet_title")}
      panelClassName="flex max-h-[min(90dvh,640px)] flex-col"
      footer={
        <div className="shrink-0 border-t border-[color:var(--overlay-border)] px-4 pb-3 pt-2">
          <DibayOverlayActions
            layout="stack"
            actions={[
              {
                key: "apply",
                label: t("trade_location_apply"),
                roleTone: "primary",
                disabled: !canApply || pinBusy,
                onClick: () => {
                  if (!canApply) return;
                  onApply(draft);
                },
              },
            ]}
          />
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-2">
        <div className="flex items-center justify-between gap-2 py-1">
          <h2 id={titleId} className="text-[18px] font-semibold text-[color:var(--overlay-text-primary)]">
            {t("trade_location_sheet_title")}
          </h2>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-ui-rect text-[color:var(--overlay-text-primary)]"
            aria-label={t("trade_location_search_aria")}
            onClick={() => setView("search")}
          >
            <Search className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="relative mt-2 h-[160px] overflow-hidden rounded-ui-rect border border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)]">
          {mapReady ? (
            <MapPicker
              marker={mapCenter}
              mode="center"
              interactionLocked={!mapEdit}
              onMarkerPositionChange={(pos) => {
                if (!mapEdit) return;
                void onMapPinChange(pos);
              }}
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[color:var(--overlay-text-secondary)]">
              {t("trade_location_map_loading")}
            </div>
          )}
        </div>

        <p className="mt-3 text-[18px] font-semibold text-[color:var(--overlay-text-primary)]">
          {draftLabel(draft, t("trade_location_all"))}
        </p>
        {pinBusy ? (
          <p className="mt-1 text-sm text-[color:var(--overlay-text-secondary)]">
            {t("trade_location_resolving_city")}
          </p>
        ) : null}
        {geoError ? (
          <p className="mt-1 text-sm text-[color:var(--overlay-danger)]">{geoError}</p>
        ) : null}

        <div className="mt-3 flex gap-2">
          <DibayOverlayButton
            roleTone="primary"
            className="min-h-11 flex-1 gap-1.5"
            loading={geoBusy}
            onClick={() => void onDeviceLocation()}
          >
            <LocateFixed className="h-4 w-4" aria-hidden />
            {t("trade_location_search_my_location")}
          </DibayOverlayButton>
          <DibayOverlayButton
            roleTone="secondary"
            className="min-h-11 flex-1 gap-1.5"
            onClick={() => setMapEdit(true)}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {t("trade_location_edit")}
          </DibayOverlayButton>
        </div>

        <button
          type="button"
          className="mt-4 min-h-11 w-full rounded-ui-rect border border-[color:var(--overlay-border)] px-3 py-2.5 text-left text-sm font-semibold text-[color:var(--overlay-primary)]"
          onClick={onViewAll}
        >
          {t("trade_location_view_all_products")}
        </button>

        <section className="mt-4">
          <p className="text-xs font-medium text-[color:var(--overlay-text-secondary)]">
            {t("trade_location_my_region")}
          </p>
          {myRegionLoading ? (
            <p className="mt-2 text-sm text-[color:var(--overlay-text-secondary)]">…</p>
          ) : myRegion ? (
            <button
              type="button"
              className="mt-1 flex min-h-11 w-full items-center rounded-ui-rect px-1 py-2 text-left font-medium text-[color:var(--overlay-text-primary)] hover:bg-[color:var(--overlay-secondary)]"
              onClick={onMyRegion}
            >
              {myRegion.displayName}
            </button>
          ) : (
            <p className="mt-2 text-sm text-[color:var(--overlay-text-secondary)]">
              {t("trade_location_my_region_missing")}
            </p>
          )}
        </section>

        {nearby.length > 0 ? (
          <section className="mt-4">
            <p className="text-xs font-medium text-[color:var(--overlay-text-secondary)]">
              {t("trade_location_nearby")}
            </p>
            <ul className="mt-1 space-y-0.5">
              {nearby.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center rounded-ui-rect px-1 py-2 text-left font-medium text-[color:var(--overlay-text-primary)] hover:bg-[color:var(--overlay-secondary)]"
                    onClick={() => onPickNearby(c.id, c.displayName)}
                  >
                    {c.displayName}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </DibayBottomSheet>
  );
}
