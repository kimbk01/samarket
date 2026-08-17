"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Pencil, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { MapPicker, MAP_PICKER_DEFAULT_CENTER } from "@/components/map/MapPicker";
import {
  TRADE_BROWSE_LOCATION_MAP_FRAME_CLASS,
  TradeBrowseLocationPageShell,
} from "@/components/trade/location/TradeBrowseLocationPageShell";
import { useTradeBrowseMyRegion } from "@/components/trade/location/use-trade-browse-my-region";
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
  tradeBrowseLocationFromScope,
  type TradeBrowseLocation,
} from "@/lib/trade/location/trade-browse-location";
import {
  cloneTradeBrowseRadiusSelection,
  defaultTradeBrowseRadiusSelection,
  tradeBrowseRadiusSelectionFromKm,
  type TradeBrowseRadiusSelection,
} from "@/lib/trade/location/trade-browse-radius";
import { getTradeLguCityDef } from "@/lib/trade/location/trade-lgu-city-rollup";
import {
  clearTradeBrowseLocationDraftSession,
  createTradeBrowseLocationDraftSession,
  readTradeBrowseLocationDraftSession,
  seedTradeBrowseLocationDraftSession,
  writeTradeBrowseLocationDraftSession,
} from "@/lib/trade/location/trade-browse-location-draft-session";
import { writeTradeBrowseCommittedScope } from "@/lib/trade/location/trade-browse-committed-session";
import {
  TRADE_BROWSE_LOCATION_DISTANCE_PATH,
  TRADE_BROWSE_LOCATION_SEARCH_PATH,
} from "@/lib/trade/location/trade-browse-location-paths";
import {
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
  peekTradeLguDisplayLabel,
} from "@/lib/trade/location/trade-location-scope";

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

function radiusFromDraft(draft: TradeBrowseLocation): TradeBrowseRadiusSelection {
  if (draft.kind === "city" && typeof draft.radiusKm === "number") {
    return tradeBrowseRadiusSelectionFromKm(draft.radiusKm);
  }
  return defaultTradeBrowseRadiusSelection();
}

function resolveInitialDraft(search: string): {
  location: TradeBrowseLocation;
  radius: TradeBrowseRadiusSelection;
} {
  const existing = readTradeBrowseLocationDraftSession();
  if (existing) {
    return { location: existing.location, radius: existing.radius };
  }
  const scope = parseTradeLocationScopeFromSearchParams(new URLSearchParams(search));
  const label =
    scope.mode === "city" ? peekTradeLguDisplayLabel(scope.canonicalId) : null;
  const location = tradeBrowseLocationFromScope(scope, label);
  const radius = radiusFromDraft(location);
  seedTradeBrowseLocationDraftSession(location, radius);
  return { location, radius };
}

/**
 * Buyer browse location — full page (not bottom sheet).
 * Draft until 전체 상품 보기 / distance 품목 보기.
 */
export function TradeBrowseLocationMainPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { myRegion, myRegionLoading } = useTradeBrowseMyRegion();

  const bootRef = useRef<ReturnType<typeof resolveInitialDraft> | null>(null);
  if (bootRef.current == null) {
    bootRef.current = resolveInitialDraft(searchParams.toString());
  }
  const boot = bootRef.current;
  const [draft, setDraft] = useState<TradeBrowseLocation>(() =>
    cloneTradeBrowseLocation(boot.location)
  );
  const [draftRadius, setDraftRadius] = useState<TradeBrowseRadiusSelection>(() =>
    cloneTradeBrowseRadiusSelection(boot.radius)
  );
  const [mapPin, setMapPin] = useState(() => draftMapCenter(boot.location));
  const [mapReady, setMapReady] = useState(false);
  const [mapEdit, setMapEdit] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const mapMountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mapMountTimer.current = setTimeout(() => setMapReady(true), 0);
    return () => {
      if (mapMountTimer.current) clearTimeout(mapMountTimer.current);
    };
  }, []);

  const persist = useCallback((location: TradeBrowseLocation, radius: TradeBrowseRadiusSelection) => {
    writeTradeBrowseLocationDraftSession(
      createTradeBrowseLocationDraftSession(location, radius)
    );
  }, []);

  useEffect(() => {
    persist(draft, draftRadius);
  }, [draft, draftRadius, persist]);

  useEffect(() => {
    if (draft.kind !== "city") return;
    if (typeof draft.lat === "number" && typeof draft.lng === "number") return;
    const name = draft.displayName;
    let cancelled = false;
    void (async () => {
      const hit = await geocodeDisplayLineToLatLng(`${name}, Philippines`);
      if (cancelled || !hit) return;
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
  }, [draft]);

  const nearby = useMemo(() => {
    const anchor = nearbyAnchorLegacyId(draft, myRegion?.canonicalId ?? null);
    return resolveTradeLguNearbyCities(anchor, {
      excludeLguId: anchor,
      limit: 4,
    });
  }, [draft, myRegion?.canonicalId]);

  const setCityDraft = useCallback(
    (canonicalId: string, displayName: string, coords?: { lat: number; lng: number }) => {
      setDraft((prev) => ({
        kind: "city",
        canonicalId,
        displayName,
        radiusKm:
          prev.kind === "city" && typeof prev.radiusKm === "number"
            ? prev.radiusKm
            : draftRadius.km,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      }));
      if (coords) setMapPin(coords);
      setGeoError(null);
    },
    [draftRadius.km]
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
        setMapEdit(true);
        return;
      }
      setCityDraft(resolved.canonicalId, resolved.displayName, {
        lat: resolved.lat,
        lng: resolved.lng,
      });
      setMapEdit(false);
    } finally {
      setGeoBusy(false);
    }
  }, [setCityDraft, t]);

  const onEditMapPan = useCallback((pos: { lat: number; lng: number }) => {
    setMapPin(pos);
  }, []);

  const onConfirmMapCenter = useCallback(async () => {
    setPinBusy(true);
    setGeoError(null);
    try {
      const resolved = await resolveBrowseLguFromLatLng(mapPin.lat, mapPin.lng);
      if (!resolved.ok) {
        setGeoError(t("trade_location_geo_city_unresolved"));
        return;
      }
      setCityDraft(resolved.canonicalId, resolved.displayName, {
        lat: resolved.lat,
        lng: resolved.lng,
      });
      setMapEdit(false);
    } finally {
      setPinBusy(false);
    }
  }, [mapPin.lat, mapPin.lng, setCityDraft, t]);

  const onToggleMapEdit = useCallback(() => {
    setMapEdit((prev) => {
      if (prev) {
        setMapPin(draftMapCenter(draft));
        setGeoError(null);
        return false;
      }
      return true;
    });
  }, [draft]);

  const canContinueToDistance =
    draft.kind === "city" && !!draft.canonicalId.trim() && !!draft.displayName.trim();

  const marketBackHref = useMemo(() => {
    const q = searchParams.toString();
    return q ? `/market?${q}` : "/market";
  }, [searchParams]);

  const onViewAll = useCallback(() => {
    clearTradeBrowseLocationDraftSession();
    writeTradeBrowseCommittedScope({ mode: "all" });
    const href = buildTradeLocationHref("/market", searchParams.toString(), { mode: "all" });
    router.replace(href, { scroll: false });
  }, [router, searchParams]);

  const onOpenDistance = useCallback(() => {
    if (!canContinueToDistance || mapEdit) return;
    const nextRadius = cloneTradeBrowseRadiusSelection(
      radiusFromDraft({
        ...draft,
        radiusKm: draftRadius.km,
      } as TradeBrowseLocation)
    );
    setDraftRadius(nextRadius);
    persist(draft, nextRadius);
    const q = searchParams.toString();
    router.push(q ? `${TRADE_BROWSE_LOCATION_DISTANCE_PATH}?${q}` : TRADE_BROWSE_LOCATION_DISTANCE_PATH);
  }, [canContinueToDistance, draft, draftRadius.km, mapEdit, persist, router, searchParams]);

  const onOpenSearch = useCallback(() => {
    setMapEdit(false);
    persist(draft, draftRadius);
    const q = searchParams.toString();
    router.push(q ? `${TRADE_BROWSE_LOCATION_SEARCH_PATH}?${q}` : TRADE_BROWSE_LOCATION_SEARCH_PATH);
  }, [draft, draftRadius, persist, router, searchParams]);

  return (
    <TradeBrowseLocationPageShell
      title={t("trade_location_sheet_title")}
      backHref={marketBackHref}
      rightSlot={
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-ui-rect text-sam-fg"
          aria-label={t("trade_location_search_aria")}
          onClick={onOpenSearch}
        >
          <Search className="h-5 w-5" aria-hidden />
        </button>
      }
      footer={
        <DibayOverlayButton
          roleTone="primary"
          className="mb-2 min-h-10 w-full"
          disabled={!canContinueToDistance || pinBusy || mapEdit}
          onClick={onOpenDistance}
        >
          {t("trade_location_continue_distance")}
        </DibayOverlayButton>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-1 md:grid md:grid-cols-2 md:gap-4 md:overflow-hidden">
        <div className="flex shrink-0 flex-col md:min-h-0 md:overflow-hidden">
          <div
            className={`${TRADE_BROWSE_LOCATION_MAP_FRAME_CLASS}${
              mapEdit ? " ring-2 ring-sam-primary ring-offset-1" : ""
            } md:min-h-0 md:flex-1 md:h-auto`}
          >
            {mapReady ? (
              <MapPicker
                marker={mapPin}
                mode="center"
                interactionLocked={!mapEdit}
                centerChrome="none"
                radiusKm={!mapEdit && draft.kind === "city" ? draftRadius.km : null}
                onMarkerPositionChange={(pos) => {
                  if (!mapEdit) return;
                  onEditMapPan(pos);
                }}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-sam-fg-muted">
                {t("trade_location_map_loading")}
              </div>
            )}
            {mapEdit ? (
              <p className="pointer-events-none absolute inset-x-2 top-2 z-20 rounded-ui-rect bg-sam-app/90 px-2 py-1.5 text-center text-xs font-medium text-sam-fg shadow-sm">
                {t("trade_location_map_edit_hint")}
              </p>
            ) : null}
          </div>
          {mapEdit ? (
            <div className="mt-2 shrink-0">
              <DibayOverlayButton
                roleTone="primary"
                className="min-h-10 w-full"
                loading={pinBusy}
                disabled={pinBusy}
                onClick={() => void onConfirmMapCenter()}
              >
                {t("trade_location_select_here")}
              </DibayOverlayButton>
            </div>
          ) : null}
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 md:mt-0 md:min-h-0">
          <p className="text-[17px] font-semibold text-sam-fg">
            {draftLabel(draft, t("trade_location_all"))}
            {mapEdit ? (
              <span className="ml-1 text-sm font-medium text-sam-fg-muted">
                ({t("trade_location_draft_pending")})
              </span>
            ) : null}
          </p>
          {pinBusy ? (
            <p className="mt-1 text-sm text-sam-fg-muted">{t("trade_location_resolving_city")}</p>
          ) : null}
          {geoError ? <p className="mt-1 text-sm text-sam-danger">{geoError}</p> : null}

          <div className="mt-2 flex gap-2">
            <DibayOverlayButton
              roleTone="primary"
              className="min-h-10 flex-1 gap-1.5"
              loading={geoBusy}
              disabled={mapEdit}
              onClick={() => void onDeviceLocation()}
            >
              <LocateFixed className="h-4 w-4" aria-hidden />
              {t("trade_location_search_my_location")}
            </DibayOverlayButton>
            <DibayOverlayButton
              roleTone="secondary"
              className="min-h-10 flex-1 gap-1.5"
              onClick={onToggleMapEdit}
            >
              <Pencil className="h-4 w-4" aria-hidden />
              {mapEdit ? t("trade_location_editing") : t("trade_location_edit")}
            </DibayOverlayButton>
          </div>

          <button
            type="button"
            className="mt-2 min-h-10 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-left text-sm font-semibold text-sam-primary"
            onClick={onViewAll}
          >
            {t("trade_location_view_all_products")}
          </button>

          <section className="mt-3">
            <p className="text-xs font-medium text-sam-fg-muted">{t("trade_location_my_region")}</p>
            {myRegionLoading ? (
              <p className="mt-1 text-sm text-sam-fg-muted">…</p>
            ) : myRegion ? (
              <button
                type="button"
                className="mt-0.5 flex min-h-10 w-full items-center rounded-ui-rect px-1 py-1.5 text-left font-medium text-sam-fg hover:bg-sam-surface-muted"
                onClick={onMyRegion}
              >
                {myRegion.displayName}
              </button>
            ) : (
              <p className="mt-1 text-sm text-sam-fg-muted">{t("trade_location_my_region_missing")}</p>
            )}
          </section>

          {nearby.length > 0 ? (
            <section className="mt-3">
              <p className="text-xs font-medium text-sam-fg-muted">{t("trade_location_nearby")}</p>
              <ul className="mt-0.5 space-y-0.5">
                {nearby.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex min-h-10 w-full items-center rounded-ui-rect px-1 py-1.5 text-left font-medium text-sam-fg hover:bg-sam-surface-muted"
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
      </div>
    </TradeBrowseLocationPageShell>
  );
}
