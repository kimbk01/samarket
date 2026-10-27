"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LocateFixed, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import {
  TradeLocationNationalPicker,
  type TradeNationalPickerHit,
} from "@/components/trade/TradeLocationNationalPicker";
import { useTradeBrowseMyRegion } from "@/components/trade/location/use-trade-browse-my-region";
import { getBestCurrentPosition } from "@/lib/map/geolocation";
import { getAppSettings } from "@/lib/admin-settings/app-settings-client";
import {
  TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL,
  resolveCanonicalToLegacyProductAlias,
} from "@/lib/trade/location/national/legacy-product-alias-canonical";
import { resolveTradeLguNearbyCities } from "@/lib/trade/location/trade-lgu-adjacency";
import { resolveBrowseLguFromLatLng } from "@/lib/trade/location/resolve-browse-lgu-from-lat-lng";
import { getTradeLguCityDef } from "@/lib/trade/location/trade-lgu-city-rollup";
import { writeTradeBrowseCommittedScope } from "@/lib/trade/location/trade-browse-committed-session";
import {
  normalizeTradeDefaultRadiusKm,
  snapTradeRadiusKm,
  useTradeRadiusOptionsKm,
} from "@/lib/trade/location/trade-radius-options";
import {
  buildTradeCityScopeFromCanonical,
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
  peekTradeLguDisplayLabel,
  rememberTradeLguDisplayLabel,
} from "@/lib/trade/location/trade-location-scope";

type Draft =
  | { kind: "all" }
  | { kind: "city"; canonicalId: string; displayName: string; radiusKm: number | null };

function draftFromSearch(search: string): Draft {
  const scope = parseTradeLocationScopeFromSearchParams(new URLSearchParams(search));
  if (scope.mode !== "city") return { kind: "all" };
  return {
    kind: "city",
    canonicalId: scope.canonicalId,
    displayName: peekTradeLguDisplayLabel(scope.canonicalId) ?? scope.canonicalId,
    radiusKm: scope.radiusKm,
  };
}

const ROW_CLASS =
  "flex min-h-11 w-full items-center rounded-ui-rect px-2 py-2 text-left sam-text-body font-medium text-sam-fg active:bg-sam-surface-muted";

/**
 * 거래 D (Owner 2026-10-28) — 📍 위치 시트 하나.
 * 예전 위치 화면 3장(`/market/location`·`/distance`·`/search`)을 대신한다(옛 주소는 next.config 307 → `/market?locSheet=1`).
 * - 내 위치 · 다른 지역 찾기 · 나의 지역 · 주변 주요 지역 · 전체 상품 보기
 * - 거리: 「전체」 + 어드민 반경 선택지(`useTradeRadiusOptionsKm`, 서버 목록 응답 값)
 * - 적용 = URL 위치 조건만 바꾼다(주제·옵션·가격·상태·검색어는 그대로). 거리 기준은 시 중심점.
 */
export function TradeBrowseLocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const radiusOptions = useTradeRadiusOptionsKm();
  const { myRegion, myRegionLoading, myRegionError, reloadMyRegion } = useTradeBrowseMyRegion();
  const [step, setStep] = useState<"main" | "search">("main");
  const [draft, setDraft] = useState<Draft>(() => draftFromSearch(searchParams.toString()));
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  /** 열 때마다 지금 URL 조건에서 시작(취소하면 아무것도 바꾸지 않는다) */
  useEffect(() => {
    if (!open) return;
    setStep("main");
    setGeoError(null);
    setDraft(draftFromSearch(searchParams.toString()));
  }, [open, searchParams]);

  /** 새 지역을 고르면 지금 반경을 유지하고, 반경이 없던 경우에만 어드민 기본 반경 */
  const pickCity = useCallback(
    (canonicalId: string, displayName: string) => {
      rememberTradeLguDisplayLabel(canonicalId, displayName);
      setDraft((prev) => ({
        kind: "city",
        canonicalId,
        displayName,
        radiusKm:
          prev.kind === "city"
            ? prev.radiusKm
            : normalizeTradeDefaultRadiusKm(getAppSettings().tradeDefaultRadiusKm, radiusOptions),
      }));
      setGeoError(null);
      setStep("main");
    },
    [radiusOptions]
  );

  const nearby = useMemo(() => {
    const anchorCanonical = draft.kind === "city" ? draft.canonicalId : myRegion?.canonicalId ?? null;
    const anchor = anchorCanonical ? resolveCanonicalToLegacyProductAlias(anchorCanonical) : null;
    return resolveTradeLguNearbyCities(anchor, { excludeLguId: anchor, limit: 4 });
  }, [draft, myRegion?.canonicalId]);

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
        return;
      }
      pickCity(resolved.canonicalId, resolved.displayName);
    } finally {
      setGeoBusy(false);
    }
  }, [pickCity, t]);

  const onPickNearby = useCallback(
    (legacyId: string, displayName: string) => {
      const cid =
        TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL[
          legacyId as keyof typeof TRADE_LEGACY_PRODUCT_ALIAS_TO_CANONICAL
        ] ?? null;
      if (!cid) return;
      pickCity(cid, getTradeLguCityDef(legacyId)?.displayName ?? displayName);
    },
    [pickCity]
  );

  const onApply = useCallback(() => {
    const scope =
      draft.kind === "city"
        ? buildTradeCityScopeFromCanonical(
            draft.canonicalId,
            draft.radiusKm == null ? null : snapTradeRadiusKm(draft.radiusKm, radiusOptions)
          )
        : ({ mode: "all" } as const);
    if (!scope) return;
    writeTradeBrowseCommittedScope(scope);
    const href = buildTradeLocationHref("/market", searchParams.toString(), scope);
    onClose();
    router.replace(href, { scroll: false });
  }, [draft, onClose, radiusOptions, router, searchParams]);

  const selectedRadius = draft.kind === "city" && draft.radiusKm != null
    ? snapTradeRadiusKm(draft.radiusKm, radiusOptions)
    : null;

  if (step === "search") {
    return (
      <DibayBottomSheet
        open={open}
        onClose={onClose}
        title={t("trade_location_search_aria")}
        heightRatio={0.85}
      >
        <div className="flex min-h-[50dvh] flex-col" data-trade-location-sheet-step="search">
          <TradeLocationNationalPicker
            selectedCanonicalId={draft.kind === "city" ? draft.canonicalId : null}
            onSelect={(hit: TradeNationalPickerHit) => pickCity(hit.canonicalId, hit.displayName)}
            onBack={() => setStep("main")}
          />
        </div>
      </DibayBottomSheet>
    );
  }

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={t("trade_location_sheet_title")}
      footer={
        <DibayOverlayButton roleTone="primary" className="min-h-11 w-full" onClick={onApply}>
          {t("trade_location_apply")}
        </DibayOverlayButton>
      }
    >
      <div className="space-y-3" data-trade-location-sheet-step="main">
        <p className="sam-text-body font-semibold text-sam-fg" data-trade-location-sheet-current="1">
          {draft.kind === "city" ? draft.displayName : t("trade_location_all")}
        </p>
        {geoError ? <p className="sam-text-helper text-sam-danger">{geoError}</p> : null}

        <div className="flex gap-2">
          <DibayOverlayButton
            roleTone="secondary"
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
            onClick={() => setStep("search")}
          >
            <Search className="h-4 w-4" aria-hidden />
            {t("trade_location_search_aria")}
          </DibayOverlayButton>
        </div>

        <section>
          <p className="sam-text-helper font-medium text-sam-muted">{t("trade_location_my_region")}</p>
          {myRegionLoading ? (
            <p className="mt-1 sam-text-helper text-sam-muted">…</p>
          ) : myRegion ? (
            <button
              type="button"
              className={ROW_CLASS}
              onClick={() => pickCity(myRegion.canonicalId, myRegion.displayName)}
            >
              {myRegion.displayName}
            </button>
          ) : myRegionError ? (
            <div className="mt-1 flex items-center gap-2" role="alert">
              <p className="min-w-0 flex-1 sam-text-helper text-sam-muted">{t("trade_location_my_region_error")}</p>
              <button
                type="button"
                className="min-h-10 shrink-0 rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper font-semibold text-sam-primary"
                onClick={() => void reloadMyRegion()}
              >
                {t("trade_location_retry")}
              </button>
            </div>
          ) : (
            <p className="mt-1 sam-text-helper text-sam-muted">{t("trade_location_my_region_missing")}</p>
          )}
        </section>

        {nearby.length > 0 ? (
          <section>
            <p className="sam-text-helper font-medium text-sam-muted">{t("trade_location_nearby")}</p>
            <ul className="mt-0.5">
              {nearby.map((c) => (
                <li key={c.id}>
                  <button type="button" className={ROW_CLASS} onClick={() => onPickNearby(c.id, c.displayName)}>
                    {c.displayName}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <button
          type="button"
          className={`${ROW_CLASS} border border-sam-border ${draft.kind === "all" ? "text-sam-primary" : ""}`}
          aria-pressed={draft.kind === "all"}
          onClick={() => setDraft({ kind: "all" })}
        >
          {t("trade_location_view_all_products")}
        </button>

        {draft.kind === "city" ? (
          <section data-trade-location-sheet-radius="1">
            <p className="sam-text-helper font-medium text-sam-muted">{t("trade_location_distance_title")}</p>
            <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label={t("trade_location_distance_title")}>
              {[null, ...radiusOptions].map((km) => {
                const active = km === selectedRadius;
                return (
                  <button
                    key={km ?? "all"}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-trade-location-radius={km ?? "all"}
                    onClick={() => setDraft((prev) => (prev.kind === "city" ? { ...prev, radiusKm: km } : prev))}
                    className={`min-h-10 rounded-full border px-4 sam-text-helper font-semibold ${
                      active
                        ? "border-sam-primary bg-sam-primary text-white"
                        : "border-sam-border bg-sam-surface text-sam-fg"
                    }`}
                  >
                    {km == null ? t("trade_location_all") : `${km}km`}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </DibayBottomSheet>
  );
}
