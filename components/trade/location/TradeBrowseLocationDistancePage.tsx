"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { MapPicker, MAP_PICKER_DEFAULT_CENTER } from "@/components/map/MapPicker";
import {
  TRADE_BROWSE_LOCATION_MAP_FRAME_CLASS,
  TradeBrowseLocationPageShell,
} from "@/components/trade/location/TradeBrowseLocationPageShell";
import { geocodeDisplayLineToLatLng } from "@/lib/map/geocode-display-line-to-lat-lng";
import {
  cloneTradeBrowseLocation,
  tradeBrowseLocationToScope,
  type TradeBrowseLocation,
} from "@/lib/trade/location/trade-browse-location";
import {
  cloneTradeBrowseRadiusSelection,
  defaultTradeBrowseRadiusSelection,
  sanitizeTradeBrowseRadiusKm,
  TRADE_BROWSE_RADIUS_MAX_KM,
  TRADE_BROWSE_RADIUS_MIN_KM,
  TRADE_BROWSE_RADIUS_PRESET_KM,
  TRADE_BROWSE_RECOMMENDED_RADIUS_KM,
  type TradeBrowseRadiusSelection,
} from "@/lib/trade/location/trade-browse-radius";
import {
  clearTradeBrowseLocationDraftSession,
  createTradeBrowseLocationDraftSession,
  readTradeBrowseLocationDraftSession,
  writeTradeBrowseLocationDraftSession,
} from "@/lib/trade/location/trade-browse-location-draft-session";
import { TRADE_BROWSE_LOCATION_PATH } from "@/lib/trade/location/trade-browse-location-paths";
import {
  buildTradeLocationHref,
  rememberTradeLguDisplayLabel,
} from "@/lib/trade/location/trade-location-scope";

function draftMapCenter(draft: TradeBrowseLocation): { lat: number; lng: number } {
  if (draft.kind === "city" && typeof draft.lat === "number" && typeof draft.lng === "number") {
    return { lat: draft.lat, lng: draft.lng };
  }
  return MAP_PICKER_DEFAULT_CENTER;
}

/**
 * Distance page — full viewport scroll for radius; sticky 품목 보기.
 * Back keeps draft (session).
 */
export function TradeBrowseLocationDistancePage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const session = useMemo(() => readTradeBrowseLocationDraftSession(), []);
  const [draft, setDraft] = useState<TradeBrowseLocation>(() =>
    cloneTradeBrowseLocation(session?.location ?? { kind: "all" })
  );
  const [draftRadius, setDraftRadius] = useState<TradeBrowseRadiusSelection>(() =>
    cloneTradeBrowseRadiusSelection(session?.radius ?? defaultTradeBrowseRadiusSelection())
  );
  const [mapPin, setMapPin] = useState(() => draftMapCenter(session?.location ?? { kind: "all" }));
  const [mapReady, setMapReady] = useState(false);
  const mapMountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session || session.location.kind !== "city") {
      const q = searchParams.toString();
      router.replace(q ? `${TRADE_BROWSE_LOCATION_PATH}?${q}` : TRADE_BROWSE_LOCATION_PATH);
    }
  }, [router, searchParams, session]);

  useEffect(() => {
    mapMountTimer.current = setTimeout(() => setMapReady(true), 0);
    return () => {
      if (mapMountTimer.current) clearTimeout(mapMountTimer.current);
    };
  }, []);

  useEffect(() => {
    writeTradeBrowseLocationDraftSession(
      createTradeBrowseLocationDraftSession(draft, draftRadius)
    );
  }, [draft, draftRadius]);

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

  const locationBackHref = useMemo(() => {
    const q = searchParams.toString();
    return q ? `${TRADE_BROWSE_LOCATION_PATH}?${q}` : TRADE_BROWSE_LOCATION_PATH;
  }, [searchParams]);

  const canCommit =
    draft.kind === "city" && !!draft.canonicalId.trim() && !!draft.displayName.trim();

  const onResetRadius = useCallback(() => {
    setDraftRadius(defaultTradeBrowseRadiusSelection());
  }, []);

  const onCommitItems = useCallback(() => {
    if (draft.kind !== "city") return;
    const next = cloneTradeBrowseLocation(draft);
    if (next.kind !== "city") return;
    const withRadius: TradeBrowseLocation = {
      ...next,
      radiusKm: sanitizeTradeBrowseRadiusKm(draftRadius.km),
    };
    rememberTradeLguDisplayLabel(withRadius.canonicalId, withRadius.displayName);
    clearTradeBrowseLocationDraftSession();
    const scope = tradeBrowseLocationToScope(withRadius);
    const href = buildTradeLocationHref("/market", searchParams.toString(), scope);
    router.replace(href, { scroll: false });
  }, [draft, draftRadius.km, router, searchParams]);

  const customActive = draftRadius.mode === "custom";

  return (
    <TradeBrowseLocationPageShell
      title={t("trade_location_distance_title")}
      backHref={locationBackHref}
      rightSlot={
        <button
          type="button"
          className="min-h-10 px-2 text-sm font-semibold text-sam-primary"
          onClick={onResetRadius}
        >
          {t("trade_location_distance_reset")}
        </button>
      }
      footer={
        <DibayOverlayButton
          roleTone="primary"
          className="mb-2 min-h-10 w-full"
          disabled={!canCommit}
          onClick={onCommitItems}
        >
          {t("trade_location_see_items")}
        </DibayOverlayButton>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-1">
        <div className={TRADE_BROWSE_LOCATION_MAP_FRAME_CLASS}>
          {mapReady ? (
            <MapPicker
              marker={mapPin}
              mode="center"
              interactionLocked
              centerChrome="none"
              radiusKm={draftRadius.km}
              onMarkerPositionChange={() => {}}
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-sam-fg-muted">
              {t("trade_location_map_loading")}
            </div>
          )}
        </div>

        <fieldset className="mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain border-0 p-0 pb-3">
          <legend className="sr-only">{t("trade_location_distance_title")}</legend>
          <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-ui-rect px-1 py-1.5">
            <input
              type="radio"
              name="trade-browse-radius"
              className="h-5 w-5 accent-[color:var(--sam-primary)]"
              checked={draftRadius.mode === "recommended"}
              onChange={() =>
                setDraftRadius({
                  mode: "recommended",
                  km: TRADE_BROWSE_RECOMMENDED_RADIUS_KM,
                })
              }
            />
            <span className="text-[15px] font-medium text-sam-fg">
              {t("trade_location_radius_recommended")} ({TRADE_BROWSE_RECOMMENDED_RADIUS_KM}km)
            </span>
          </label>
          {TRADE_BROWSE_RADIUS_PRESET_KM.map((km) => (
            <label
              key={km}
              className="flex min-h-10 cursor-pointer items-center gap-3 rounded-ui-rect px-1 py-1.5"
            >
              <input
                type="radio"
                name="trade-browse-radius"
                className="h-5 w-5 accent-[color:var(--sam-primary)]"
                checked={draftRadius.mode === "preset" && draftRadius.km === km}
                onChange={() => setDraftRadius({ mode: "preset", km })}
              />
              <span className="text-[15px] font-medium text-sam-fg">{km}km</span>
            </label>
          ))}
          <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-ui-rect px-1 py-1.5">
            <input
              type="radio"
              name="trade-browse-radius"
              className="h-5 w-5 accent-[color:var(--sam-primary)]"
              checked={customActive}
              onChange={() =>
                setDraftRadius({
                  mode: "custom",
                  km: sanitizeTradeBrowseRadiusKm(draftRadius.km),
                })
              }
            />
            <span className="text-[15px] font-medium text-sam-fg">
              {t("trade_location_radius_custom")}
            </span>
          </label>
          {customActive ? (
            <div className="px-1 pb-2 pt-1">
              <input
                type="range"
                min={TRADE_BROWSE_RADIUS_MIN_KM}
                max={TRADE_BROWSE_RADIUS_MAX_KM}
                step={1}
                value={sanitizeTradeBrowseRadiusKm(draftRadius.km)}
                onChange={(e) =>
                  setDraftRadius({
                    mode: "custom",
                    km: sanitizeTradeBrowseRadiusKm(Number(e.target.value)),
                  })
                }
                className="w-full accent-[color:var(--sam-primary)]"
                aria-label={t("trade_location_radius_custom")}
              />
              <p className="mt-1 text-sm text-sam-fg-muted">
                {sanitizeTradeBrowseRadiusKm(draftRadius.km)}km
              </p>
            </div>
          ) : null}
        </fieldset>
      </div>
    </TradeBrowseLocationPageShell>
  );
}
