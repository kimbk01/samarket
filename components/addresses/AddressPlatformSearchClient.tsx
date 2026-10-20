"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { AddressEditorLocationSearch } from "@/components/addresses/AddressEditorLocationSearch";
import { fetchPlacePredictionsPhResult, type PlacePredictionRow } from "@/lib/map/fetch-place-predictions-ph";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { Sam } from "@/lib/ui/sam-component-classes";
import { resolveAddressSearchResultState } from "@/lib/addresses/address-search-result-state";
import { resolveCanonicalAddressFromPlaceId, resolveCanonicalAddressFromLatLng } from "@/lib/addresses/canonical-address-resolver";
import { writeAddressPlatformV2Draft } from "@/lib/addresses/canonical-address-draft-storage";
import {
  buildMypageAddressEditHref,
  buildMypageAddressesHref,
  parseSafeInternalReturnTo,
} from "@/lib/addresses/mypage-addresses-return-to";
import { requestLocationWithDiBaYGate } from "@/lib/permissions/device-permission-manager";
import {
  MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS,
} from "@/lib/addresses/mypage-address-manage-layout";

/** 뒤로 돌아오면 입력어 유지 (S08) — 탭 세션 한정 */
export const MYPAGE_ADDRESS_SEARCH_QUERY_SESSION_KEY = "dibay:mypage-address-search:q";

function readSavedQuery(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(MYPAGE_ADDRESS_SEARCH_QUERY_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSavedQuery(q: string): void {
  if (typeof window === "undefined") return;
  try {
    if (q) window.sessionStorage.setItem(MYPAGE_ADDRESS_SEARCH_QUERY_SESSION_KEY, q);
    else window.sessionStorage.removeItem(MYPAGE_ADDRESS_SEARCH_QUERY_SESSION_KEY);
  } catch {
    /* private mode */
  }
}

function AddressPlatformSearchInner() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const returnTo = parseSafeInternalReturnTo(sp.get("returnTo"));
  const listHref = buildMypageAddressesHref(returnTo);
  const [search, setSearchState] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [predictions, setPredictions] = useState<PlacePredictionRow[]>([]);
  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    writeSavedQuery(value);
  }, []);

  /** 하이드레이션 후 저장된 입력어 복원(뒤로 돌아온 경우) */
  useEffect(() => {
    const saved = readSavedQuery();
    if (saved) setSearchState(saved);
  }, []);
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setPredictions([]);
      setSearching(false);
      setSearchFailed(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await fetchPlacePredictionsPhResult(q);
          if (cancelled) return;
          if (result.ok) {
            setPredictions(result.rows);
            setSearchFailed(false);
          } else {
            setPredictions([]);
            setSearchFailed(true);
          }
        } catch {
          if (!cancelled) {
            setPredictions([]);
            setSearchFailed(true);
          }
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, retryKey]);

  const resultState = resolveAddressSearchResultState({
    query: search,
    searching,
    failed: searchFailed,
    count: predictions.length,
  });

  const goDetail = useCallback(() => {
    router.replace(buildMypageAddressEditHref({ returnTo }));
  }, [returnTo, router]);

  async function onSelectPrediction(row: PlacePredictionRow) {
    if (!row.placeId.trim()) return;
    setErr(null);
    setResolvingPlaceId(row.placeId);
    try {
      const draft = await resolveCanonicalAddressFromPlaceId(row.placeId);
      if (!draft) {
        setErr(t("addr_ui_coords_invalid"));
        return;
      }
      writeAddressPlatformV2Draft({ draft, source: "search" });
      goDetail();
    } finally {
      setResolvingPlaceId(null);
    }
  }

  async function onCurrentLocation() {
    setErr(null);
    setLocating(true);
    try {
      const res = await requestLocationWithDiBaYGate({ featureKey: "delivery_address_location" });
      if (!res.ok) {
        if (res.reason === "later") return;
        setErr(res.reason === "denied" ? t("addr_ui_geo_hint_default") : t("addr_ui_geo_failed"));
        return;
      }
      const draft = await resolveCanonicalAddressFromLatLng(res.position.latitude, res.position.longitude);
      if (!draft) {
        setErr(t("addr_ui_resolve_failed"));
        return;
      }
      writeAddressPlatformV2Draft({ draft, source: "current_location" });
      goDetail();
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className={MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        inlineChrome
        registerMainTier1={false}
        titleKey="addr_v2_search_title"
        backHref={listHref}
        hideCtaStrip
        showHubQuickActions
      />
      <div className={MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS}>
        <div className={MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS}>
          <p className="mb-3 text-[18px] font-bold leading-snug text-sam-fg">{t("addr_v2_search_lead")}</p>
          <AddressEditorLocationSearch
            search={search}
            searching={false}
            predictions={resultState === "results" ? predictions : []}
            resolvingPlaceId={resolvingPlaceId}
            onSearchChange={setSearch}
            onSearchFocus={() => undefined}
            onSelectPrediction={(p) => void onSelectPrediction(p)}
            placeholder={t("addr_v2_search_placeholder")}
          />
          {err ? <p className="mt-2 sam-text-body-secondary font-medium text-sam-danger">{err}</p> : null}
          {resultState === "searching" ? (
            <div className="mt-2">
              <MyStateView kind="loading" template="list" rows={3} />
            </div>
          ) : null}
          {resultState === "empty" ? (
            <div className="mt-5 space-y-1 text-center" data-testid="address-search-empty">
              <p className="sam-text-body font-semibold text-sam-fg">{t("mypage_s08_no_results")}</p>
              <p className="sam-text-helper text-sam-muted">{t("mypage_s08_no_results_tip")}</p>
            </div>
          ) : null}
          {resultState === "error" ? (
            <MyStateView
              kind="error"
              template="list"
              error={{ message: t("mypage_s08_search_failed"), onRetry: () => setRetryKey((k) => k + 1) }}
            />
          ) : null}
          {resultState === "idle" ? (
            <div className="mt-5 space-y-2 sam-text-body-secondary text-sam-muted">
              <p className="font-semibold text-sam-fg">{t("addr_v2_search_hint_title")}</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>{t("addr_v2_search_hint_road")}</li>
                <li>{t("addr_v2_search_hint_building")}</li>
                <li>{t("addr_v2_search_hint_place")}</li>
                <li>{t("addr_v2_search_hint_lot")}</li>
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} ${Sam.focusRing} mt-6 disabled:opacity-45`}
            disabled={locating}
            onClick={() => void onCurrentLocation()}
          >
            {locating ? t("addr_ui_locating") : t("addr_ui_find_current")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddressPlatformSearchClient() {
  return (
    <Suspense fallback={null}>
      <AddressPlatformSearchInner />
    </Suspense>
  );
}
