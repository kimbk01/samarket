"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { AddressEditorLocationSearch } from "@/components/addresses/AddressEditorLocationSearch";
import { fetchPlacePredictionsPhResult, type PlacePredictionRow } from "@/lib/map/fetch-place-predictions-ph";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { Sam } from "@/lib/ui/sam-component-classes";
import { resolveAddressSearchResultState } from "@/lib/addresses/address-search-result-state";
import { resolveCanonicalAddressFromPlaceId, resolveCanonicalAddressFromLatLng } from "@/lib/addresses/canonical-address-resolver";
import {
  MYPAGE_ADDRESS_SEARCH_QUERY_SESSION_KEY,
  writeAddressPlatformV2Draft,
} from "@/lib/addresses/canonical-address-draft-storage";
import {
  buildMypageAddressEditHref,
  buildMypageAddressesHref,
  parseSafeInternalReturnTo,
} from "@/lib/addresses/mypage-addresses-return-to";
import { requestLocationWithDiBaYGate } from "@/lib/permissions/device-permission-manager";
import { withTimeout } from "@/lib/async/with-timeout";
import {
  MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS,
  MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS,
} from "@/lib/addresses/mypage-address-manage-layout";

/** 뒤로 돌아오면 입력어 유지 (S08) — 탭 세션 한정. 키 정의는 draft storage (저장 성공 시 제거) */
export { MYPAGE_ADDRESS_SEARCH_QUERY_SESSION_KEY };

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

/** 네트워크가 끊겨 장소 조회가 멈춰도 이 시간 뒤엔 오류 안내 */
const PLACE_RESOLVE_TIMEOUT_MS = 12_000;

function AddressPlatformSearchInner() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const returnTo = parseSafeInternalReturnTo(sp.get("returnTo"));
  /** 편집 중 재검색(UX-002) — 결과를 같은 주소 편집으로 */
  const editId = (sp.get("id") ?? "").trim();
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
    router.replace(buildMypageAddressEditHref({ returnTo, id: editId || undefined }));
  }, [editId, returnTo, router]);

  /**
   * 화면 단일 비행 (CTA-002) — 결과 행·현재 위치 중 하나라도 해석 중이면 다른 선택을 막고,
   * 요청 토큰이 최신인 결과만 draft 를 쓰고 이동한다.
   */
  const resolveTokenRef = useRef(0);
  const resolveInFlightRef = useRef(false);
  const selectionBusy = resolvingPlaceId != null || locating;

  useEffect(
    () => () => {
      resolveTokenRef.current += 1;
    },
    [],
  );

  function beginResolve(): number | null {
    if (resolveInFlightRef.current) return null;
    resolveInFlightRef.current = true;
    resolveTokenRef.current += 1;
    return resolveTokenRef.current;
  }

  function endResolve(token: number) {
    if (token === resolveTokenRef.current) resolveInFlightRef.current = false;
  }

  async function onSelectPrediction(row: PlacePredictionRow) {
    if (!row.placeId.trim()) return;
    const token = beginResolve();
    if (token == null) return;
    setErr(null);
    /** 오프라인이면 장소 조회가 끝나지 않으므로 바로 안내 */
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErr(t("addr_ui_resolve_failed"));
      endResolve(token);
      return;
    }
    setResolvingPlaceId(row.placeId);
    try {
      const draft = await withTimeout(
        resolveCanonicalAddressFromPlaceId(row.placeId),
        PLACE_RESOLVE_TIMEOUT_MS,
        "place_resolve_timeout",
      );
      if (token !== resolveTokenRef.current) return;
      if (!draft) {
        setErr(t("addr_ui_coords_invalid"));
        return;
      }
      writeAddressPlatformV2Draft({ draft, source: "search" });
      goDetail();
    } catch {
      if (token === resolveTokenRef.current) setErr(t("addr_ui_resolve_failed"));
    } finally {
      endResolve(token);
      if (token === resolveTokenRef.current) setResolvingPlaceId(null);
    }
  }

  async function onCurrentLocation() {
    const token = beginResolve();
    if (token == null) return;
    setErr(null);
    setLocating(true);
    try {
      const res = await requestLocationWithDiBaYGate({ featureKey: "delivery_address_location" });
      if (token !== resolveTokenRef.current) return;
      if (!res.ok) {
        if (res.reason === "later") return;
        setErr(res.reason === "denied" ? t("addr_ui_geo_hint_default") : t("addr_ui_geo_failed"));
        return;
      }
      const draft = await resolveCanonicalAddressFromLatLng(res.position.latitude, res.position.longitude);
      if (token !== resolveTokenRef.current) return;
      if (!draft) {
        setErr(t("addr_ui_resolve_failed"));
        return;
      }
      writeAddressPlatformV2Draft({ draft, source: "current_location" });
      goDetail();
    } catch {
      if (token === resolveTokenRef.current) setErr(t("addr_ui_resolve_failed"));
    } finally {
      endResolve(token);
      if (token === resolveTokenRef.current) setLocating(false);
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
            searching={searching}
            predictions={resultState === "results" ? predictions : []}
            resolvingPlaceId={resolvingPlaceId}
            selectionLocked={selectionBusy}
            onSearchChange={setSearch}
            onSearchFocus={() => undefined}
            onSelectPrediction={(p) => void onSelectPrediction(p)}
            placeholder={t("addr_v2_search_placeholder")}
          />
          {err ? (
            <p className="mt-2 sam-text-body-secondary font-medium text-sam-danger" role="alert">
              {err}
            </p>
          ) : null}
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
            disabled={selectionBusy}
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
