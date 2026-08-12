"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPicker, MAP_PICKER_DEFAULT_CENTER } from "@/components/map/MapPicker";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { fetchPlacePredictionsPh, type PlacePredictionRow } from "@/lib/map/fetch-place-predictions-ph";
import { geocodeDisplayLineToLatLng } from "@/lib/map/geocode-display-line-to-lat-lng";
import {
  fetchMeetSpotPinFallbackCenter,
  fetchProfileLatLngForMeetSpotMap,
  pickTradeMeetSpotCenterFromAddressDefaults,
} from "@/lib/map/initial-trade-meet-spot-center";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import {
  PLACE_FIELDS_LOCATION,
  PLACE_FIELDS_POI_FULL,
  fetchPlaceDetailsAsLegacyPlaceResult,
} from "@/lib/map/places-new-api";
import {
  resolveTradeMeetSpotDisplayLine,
  TRADE_MEET_SPOT_NEARBY_POI_MAX_METERS,
} from "@/lib/map/resolve-trade-meet-spot-display-line";
import { buildPhFriendlyAddress, isSuitableEstablishmentDisplayName } from "@/lib/map/ph-friendly-address";
import {
  clearTradeMeetSpotGeocodeHint,
  getTradeMeetSpotGeocodeHint,
  getTradeMeetSpotPickDraft,
  setTradeMeetSpotPickDraft,
  setTradeMeetSpotPickResult,
} from "@/lib/posts/trade-meet-spot-pick-storage";
import {
  markTradeWriteSkipPersistedDraftPromptAfterMeetSpot,
  normalizeTradeMeetSpotReturnTo,
  parseMarketTradeWriteReturnCategoryKey,
  scheduleTradeWriteSheetReopenAfterMeetSpot,
} from "@/lib/navigation/trade-meet-spot-return-to";
import { mapAddressLineToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type LatLng = { lat: number; lng: number };

type MeetSpotSnap = {
  lat: number;
  lng: number;
  displayLine: string;
  placeId: string | null;
};

function distMetersMeetSpot(a: LatLng, b: Pick<LatLng, "lat" | "lng">): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normPlaceId(p: string | null | undefined): string {
  return (p ?? "").trim();
}

/** 입장 후 자동 반영된 핀·주소와 현재가 같은지(사용자가 바꾼 뒤 원복한 경우 포함) */
function isMeetSpotSnapshotEqual(cur: MeetSpotSnap, settled: MeetSpotSnap, maxDistM = 12): boolean {
  if (cur.displayLine.trim() !== settled.displayLine.trim()) return false;
  if (normPlaceId(cur.placeId) !== normPlaceId(settled.placeId)) return false;
  return distMetersMeetSpot({ lat: cur.lat, lng: cur.lng }, settled) <= maxDistM;
}

function safeReturnPath(raw: string | null): string {
  if (!raw || typeof raw !== "string") return "/market";
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/market";
  if (t.length > 512) return "/market";
  return normalizeTradeMeetSpotReturnTo(t);
}

type DisplayResolve = Awaited<ReturnType<typeof resolveTradeMeetSpotDisplayLine>>;

function useReverseGeocode(
  marker: LatLng,
  onAfterResolve?: (resolved: DisplayResolve, at: LatLng, isStale: () => boolean) => void
): { text: string; busy: boolean } {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const runIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const runId = ++runIdRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        const at = { lat: marker.lat, lng: marker.lng };
        try {
          await loadGoogleMaps();
        } catch {
          return;
        }
        if (cancelled || runId !== runIdRef.current) return;
        setBusy(true);
        try {
          const resolved = await resolveTradeMeetSpotDisplayLine(at, () => cancelled || runId !== runIdRef.current);
          if (cancelled || runId !== runIdRef.current) return;
          setText(resolved.displayLine);
          onAfterResolve?.(resolved, at, () => cancelled || runId !== runIdRef.current);
        } catch {
          if (!cancelled && runId === runIdRef.current) {
            setText("");
          }
        } finally {
          if (!cancelled && runId === runIdRef.current) {
            setBusy(false);
          }
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [marker.lat, marker.lng, onAfterResolve]);

  return { text, busy };
}

/**
 * 중고 거래 — 거래 희망 장소(지도 핀 + 간단 주소) 선택 후 확인 시 글쓰기로 복귀
 */
export function TradeMeetSpotPickClient() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = useMemo(
    () => safeReturnPath(searchParams.get("returnTo")),
    [searchParams]
  );

  const [marker, setMarker] = useState<LatLng>(MAP_PICKER_DEFAULT_CENTER);
  const [displayLine, setDisplayLine] = useState("");
  /** 직접 수정 중이면 역지오 결과로 덮어쓰지 않음 — 핀 이동 시 리셋 */
  const [addressTouched, setAddressTouched] = useState(false);
  const addressTouchedRef = useRef(false);
  /** Google Place — 저장·재입장 시 `getDetails(geometry)` 로 핀 정합 (lat/lng 단독보다 우선) */
  const [anchoredPlaceId, setAnchoredPlaceId] = useState<string | null>(null);

  useEffect(() => {
    addressTouchedRef.current = addressTouched;
  }, [addressTouched]);

  /**
   * 지도 클릭에 `placeId` 가 없어도(도로 좌표만 올 때) 역지오가 성당·랜드마크명을 쓰면
   * `suggestedAnchorPlaceId` 로 핀·세션 앵커를 맞춤 — 표시 주소와 핀 불일치 방지.
   */
  const onAfterReverseGeocodeResolve = useCallback((resolved: DisplayResolve, at: LatLng, isStale: () => boolean) => {
    const sid = resolved.suggestedAnchorPlaceId?.trim();
    if (!sid || addressTouchedRef.current) return;
    void (async () => {
      try {
        await loadGoogleMaps();
      } catch {
        return;
      }
      if (isStale()) return;
      const place = await fetchPlaceDetailsAsLegacyPlaceResult(sid, PLACE_FIELDS_LOCATION);
      if (isStale() || addressTouchedRef.current) return;
      const loc = place?.geometry?.location;
      if (!loc) return;
      const dist = google.maps.geometry.spherical.computeDistanceBetween(
        loc,
        new google.maps.LatLng(at.lat, at.lng)
      );
      /** `suggestedAnchorPlaceId` 는 이 반경 안에서만 나오므로 동일 상한(+1m 여유)으로만 수락 */
      if (dist > TRADE_MEET_SPOT_NEARBY_POI_MAX_METERS + 1) return;
      /** 0.8m 이상일 때만 옮기면 줌 시 미세 오차가 남음 — geometry 를 단일 진실로 맞춤 */
      const SNAP_EPSILON_M = 0.04;
      if (dist > SNAP_EPSILON_M) {
        setMarker({ lat: loc.lat(), lng: loc.lng() });
      }
      const pid = place.place_id?.trim() || sid;
      setAnchoredPlaceId(pid);
    })();
  }, []);

  const { text: geocodedLine, busy: geocodeBusy } = useReverseGeocode(marker, onAfterReverseGeocodeResolve);

  const [mapsError, setMapsError] = useState<string | null>(null);
  const draftHydratedRef = useRef(false);
  /** 세션에 지도 초안이 있으면(이전 핀·글쓰기 시드) 사용자 주소로 덮어쓰지 않음 */
  const hadSessionPickDraftRef = useRef(false);
  /** 대표 주소 좌표 적용 전에는 세션 드래프트를 쓰지 않음 — 이전 세션의 기본 중심 좌표가 덮어쓰이지 않게 함 */
  const [initialPinReady, setInitialPinReady] = useState(false);
  /** `display_line`만 저장된 글 — 입장 후 지오코딩으로 핀 복원 */
  const [pendingGeocodeLine, setPendingGeocodeLine] = useState<string | null>(null);
  /** 세션 드래프트에 `place_id` 가 있으면 마운트 후 한 번 geometry 로 핀 보정 */
  const [geometryResolveTarget, setGeometryResolveTarget] = useState<string | null>(null);
  const [domReady, setDomReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  /** 지도·주소를 사용자가 건드렸으면 입장 기준 스냅샷 갱신 중단 */
  const userInteractionRef = useRef(false);
  /** 역지오·geometry 등 자동 반영만 반영된 최종 상태 — 취소 시 비교 기준 */
  const settledEntryRef = useRef<MeetSpotSnap | null>(null);
  const [cancelChangeConfirmOpen, setCancelChangeConfirmOpen] = useState(false);
  const replaceNavRafRef = useRef<number | null>(null);
  /** 「주소로 지도 찾기」전용 — 표시할 주소와 분리 */
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [addressPredictions, setAddressPredictions] = useState<PlacePredictionRow[]>([]);
  const [addressPredictionsBusy, setAddressPredictionsBusy] = useState(false);
  const [predictionPickBusy, setPredictionPickBusy] = useState(false);
  const [manualAddressForwardHint, setManualAddressForwardHint] = useState<string | null>(null);
  /** 주소록 대표→거래→생활→배달, 없으면 프로필 핀 — 「대표 주소로 복귀」 */
  const [representativeCenter, setRepresentativeCenter] = useState<LatLng | null>(null);

  useEffect(
    () => () => {
      if (replaceNavRafRef.current != null) {
        cancelAnimationFrame(replaceNavRafRef.current);
        replaceNavRafRef.current = null;
      }
    },
    []
  );

  /**
   * OS/브라우저 뒤로가기 등 `navigateBack` 을 타지 않고 나갈 때도 `/market/{카테고리}` 면
   * 이어쓰기 모달 스킵·시트 재오픈 플래그를 맞춤. 경로가 `/market/a/b` 처럼 깊으면 오탐 방지로 생략.
   * 이중 rAF: Next 라우터가 URL 을 반영한 뒤 읽기(마이크로태스크만으로는 이전 경로가 남을 수 있음).
   */
  useEffect(() => {
    return () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            const pathOnly = window.location.pathname.split("?")[0] ?? "";
            const segs = pathOnly.split("/").filter(Boolean);
            if (segs[0] !== "market" || segs.length !== 2 || segs[1] === "trade-meet-spot") return;
            const href = `${window.location.pathname}${window.location.search}`;
            if (!parseMarketTradeWriteReturnCategoryKey(href)) return;
            markTradeWriteSkipPersistedDraftPromptAfterMeetSpot();
            scheduleTradeWriteSheetReopenAfterMeetSpot(href);
          } catch {
            /* ignore */
          }
        });
      });
    };
  }, []);

  /** 세션 초안 복원 — 서버/클라 HTML 불일치 없이 클라에서만 적용(뒤로가기 후 재입장 시 핀·표시 주소 유지) */
  useLayoutEffect(() => {
    const d = getTradeMeetSpotPickDraft();
    const hint = getTradeMeetSpotGeocodeHint();
    if (d) {
      hadSessionPickDraftRef.current = true;
      clearTradeMeetSpotGeocodeHint();
      setMarker({ lat: d.lat, lng: d.lng });
      setDisplayLine(d.displayLine);
      setAddressTouched(d.addressTouched);
      const pid = d.placeId?.trim() ?? "";
      setAnchoredPlaceId(pid || null);
      if (pid) {
        setGeometryResolveTarget(pid);
        setInitialPinReady(false);
      } else {
        setGeometryResolveTarget(null);
        setInitialPinReady(true);
      }
    } else if (hint?.displayLine?.trim()) {
      const line = hint.displayLine.trim();
      clearTradeMeetSpotGeocodeHint();
      hadSessionPickDraftRef.current = true;
      setDisplayLine(line);
      setAddressTouched(true);
      setPendingGeocodeLine(line);
    } else {
      hadSessionPickDraftRef.current = false;
    }
    draftHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!pendingGeocodeLine) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadGoogleMaps();
        let ll = await geocodeDisplayLineToLatLng(pendingGeocodeLine);
        if (cancelled) return;
        if (!ll) {
          ll = await fetchMeetSpotPinFallbackCenter();
        }
        if (!cancelled && ll) {
          setMarker(ll);
        }
      } catch {
        if (!cancelled) {
          const fb = await fetchMeetSpotPinFallbackCenter();
          if (!cancelled && fb) setMarker(fb);
        }
      } finally {
        if (!cancelled) {
          setPendingGeocodeLine(null);
          setInitialPinReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingGeocodeLine]);

  /** 세션에 `place_id` 가 있으면 Places geometry 로 핀 덮어씀 — DB/지오코딩 오차와 무관 */
  useEffect(() => {
    if (!geometryResolveTarget) return;
    let cancelled = false;
    const id = geometryResolveTarget;
    void (async () => {
      try {
        await loadGoogleMaps();
      } catch {
        if (!cancelled) {
          setGeometryResolveTarget(null);
          setInitialPinReady(true);
        }
        return;
      }
      if (cancelled) return;
      const place = await fetchPlaceDetailsAsLegacyPlaceResult(id, PLACE_FIELDS_LOCATION);
      if (cancelled) return;
      if (place?.geometry?.location) {
        const loc = place.geometry.location;
        setMarker({ lat: loc.lat(), lng: loc.lng() });
        const resolvedPid = place.place_id?.trim();
        if (resolvedPid) setAnchoredPlaceId(resolvedPid);
      }
      setGeometryResolveTarget(null);
      setInitialPinReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [geometryResolveTarget]);

  /** 입장 직후 자동으로 잡힌 핀·표시 줄 스냅샷 — 사용자가 수정하기 전까지 갱신 */
  useEffect(() => {
    if (userInteractionRef.current) return;
    if (!initialPinReady || geometryResolveTarget || pendingGeocodeLine || geocodeBusy) return;
    const tid = window.setTimeout(() => {
      if (userInteractionRef.current) return;
      settledEntryRef.current = {
        lat: marker.lat,
        lng: marker.lng,
        displayLine: (displayLine.trim() || geocodedLine.trim()),
        placeId: anchoredPlaceId,
      };
    }, 550);
    return () => window.clearTimeout(tid);
  }, [
    initialPinReady,
    geometryResolveTarget,
    pendingGeocodeLine,
    geocodeBusy,
    marker.lat,
    marker.lng,
    displayLine,
    geocodedLine,
    anchoredPlaceId,
  ]);

  /**
   * 초안이 없을 때만: 주소록 대표→거래→생활→배달 좌표, 없으면 프로필 지도 핀.
   * 없으면 `MAP_PICKER_DEFAULT_CENTER`(폴백).
   */
  useEffect(() => {
    if (hadSessionPickDraftRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await fetchAddressDefaultsSnapshot({
          caller: "trade_meet_spot_pick",
          reason: "meet_spot_seed",
        });
        if (cancelled) return;
        const fromBook = pickTradeMeetSpotCenterFromAddressDefaults(snap);
        if (fromBook) {
          setMarker(fromBook);
          return;
        }
        const fromProfile = await fetchProfileLatLngForMeetSpotMap();
        if (cancelled) return;
        if (fromProfile) setMarker(fromProfile);
      } catch {
        /* 네트워크 실패 시 기본 중심 유지 */
      } finally {
        if (!cancelled) setInitialPinReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftHydratedRef.current || !initialPinReady) return;
    const t = window.setTimeout(() => {
      setTradeMeetSpotPickDraft({
        lat: marker.lat,
        lng: marker.lng,
        displayLine,
        addressTouched,
        ...(anchoredPlaceId ? { placeId: anchoredPlaceId } : {}),
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [marker.lat, marker.lng, displayLine, addressTouched, initialPinReady, anchoredPlaceId]);

  const onMarkerChange = useCallback((m: LatLng) => {
    userInteractionRef.current = true;
    setAddressTouched(false);
    setAnchoredPlaceId(null);
    setManualSearchQuery("");
    setAddressPredictions([]);
    setManualAddressForwardHint(null);
    setMarker(m);
  }, []);

  /** 사용자가 지도 위 POI(상호 아이콘)를 직접 클릭 — 상호명 표시 + 핀은 장소 좌표(geometry)에 맞춤 (클릭한 도로와 상호 주소 불일치 방지) */
  const onPoiClick = useCallback(
    (info: { placeId: string; lat: number; lng: number }) => {
      userInteractionRef.current = true;
      setManualSearchQuery("");
      setAddressPredictions([]);
      setManualAddressForwardHint(null);
      /** getDetails 전에 동기로 막음 — 역지오가 도로 주소로 displayLine 을 덮어쓰지 않게 */
      setAddressTouched(true);
      setAnchoredPlaceId(info.placeId.trim());
      void (async () => {
        try {
          await loadGoogleMaps();
        } catch {
          return;
        }
        const place = await fetchPlaceDetailsAsLegacyPlaceResult(info.placeId, PLACE_FIELDS_POI_FULL);
        if (!place) {
          setMarker({ lat: info.lat, lng: info.lng });
          return;
        }
        const loc = place.geometry?.location;
        if (loc) {
          setMarker({ lat: loc.lat(), lng: loc.lng() });
        } else {
          setMarker({ lat: info.lat, lng: info.lng });
        }
        const stablePid = place.place_id?.trim() || info.placeId.trim();
        if (stablePid) setAnchoredPlaceId(stablePid);
        const name = place.name?.trim() ?? "";
        const components = place.address_components ?? [];
        if (name && isSuitableEstablishmentDisplayName(name, components)) {
          const line = buildPhFriendlyAddress({ components, placeName: name }).trim();
          if (line) {
            setAddressTouched(true);
            setDisplayLine(line);
          }
        } else if (place.formatted_address?.trim()) {
          setAddressTouched(true);
          setDisplayLine(place.formatted_address.trim());
        }
      })();
    },
    []
  );

  useEffect(() => {
    if (!geocodedLine || addressTouched) return;
    setDisplayLine(geocodedLine);
  }, [geocodedLine, addressTouched]);

  useEffect(() => {
    void loadGoogleMaps().catch(() => setMapsError(t("trade_write_meet_spot_maps_load_fail")));
  }, [t]);

  useEffect(() => {
    setDomReady(true);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  /** 주소록·프로필 기준 대표 좌표 — 화면 초안과 무관하게 확보(대표 주소로 복귀) */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snap = await fetchAddressDefaultsSnapshot({
          caller: "trade_meet_spot_pick",
          reason: "meet_spot_seed",
        });
        if (cancelled) return;
        const fromBook = pickTradeMeetSpotCenterFromAddressDefaults(snap);
        if (fromBook) {
          setRepresentativeCenter(fromBook);
          return;
        }
        const prof = await fetchProfileLatLngForMeetSpotMap();
        if (!cancelled && prof) setRepresentativeCenter(prof);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 「주소로 지도 찾기」— Places 자동완성 예측(목록에서 선택 시 핀 이동) */
  useEffect(() => {
    if (closing || mapsError) return;
    const q = manualSearchQuery.trim();
    if (q.length < 2) {
      setAddressPredictions([]);
      setAddressPredictionsBusy(false);
      setManualAddressForwardHint(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setAddressPredictionsBusy(true);
        setManualAddressForwardHint(null);
        try {
          const rows = await fetchPlacePredictionsPh(q);
          if (cancelled) return;
          setAddressPredictions(rows);
          if (!rows.length && q.length >= 3) {
            setManualAddressForwardHint(t("trade_write_meet_spot_no_similar"));
          }
        } catch {
          if (!cancelled) {
            setAddressPredictions([]);
            setManualAddressForwardHint(t("trade_write_meet_spot_search_error"));
          }
        } finally {
          if (!cancelled) setAddressPredictionsBusy(false);
        }
      })();
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [manualSearchQuery, closing, mapsError, t]);

  const applyPlacePrediction = useCallback(async (row: PlacePredictionRow) => {
    userInteractionRef.current = true;
    setManualAddressForwardHint(null);
    setAddressPredictions([]);
    setPredictionPickBusy(true);
    try {
      await loadGoogleMaps();
      const place = await fetchPlaceDetailsAsLegacyPlaceResult(row.placeId, PLACE_FIELDS_LOCATION);
      const loc = place?.geometry?.location;
      if (loc) {
        setMarker({ lat: loc.lat(), lng: loc.lng() });
        const pid = (place.place_id ?? row.placeId).trim();
        setAnchoredPlaceId(pid || null);
      } else {
        const geo = await geocodeDisplayLineToLatLng(row.description);
        if (!geo) {
          setManualAddressForwardHint(t("trade_write_meet_spot_coord_load_fail"));
          return;
        }
        setMarker({ lat: geo.lat, lng: geo.lng });
        setAnchoredPlaceId(geo.placeId?.trim() ? geo.placeId.trim() : null);
      }
      setManualSearchQuery(row.description);
      setAddressTouched(false);
    } catch {
      setManualAddressForwardHint(t("trade_write_meet_spot_place_load_fail"));
    } finally {
      setPredictionPickBusy(false);
    }
  }, [t]);

  const restoreRepresentativePin = useCallback(() => {
    if (!representativeCenter) return;
    userInteractionRef.current = true;
    setMarker(representativeCenter);
    setAnchoredPlaceId(null);
    setAddressTouched(false);
    setManualSearchQuery("");
    setAddressPredictions([]);
    setManualAddressForwardHint(null);
  }, [representativeCenter]);

  const fallbackCoordLine = useMemo(
    () =>
      t("trade_write_meet_spot_coord_selected", {
        lat: marker.lat.toFixed(5),
        lng: marker.lng.toFixed(5),
      }),
    [marker.lat, marker.lng, t]
  );

  const navigateBack = useCallback(
    (opts: { saveResult: boolean }) => {
      if (closing) return;
      if (opts.saveResult) {
        const line =
          displayLine.trim() || geocodedLine.trim() || fallbackCoordLine;
        const lineTrimmed = line.trim();
        if (!lineTrimmed) return;
        const matched = mapAddressLineToAppLocation(lineTrimmed);
        setTradeMeetSpotPickResult({
          displayLine: lineTrimmed,
          lat: marker.lat,
          lng: marker.lng,
          ...(anchoredPlaceId ? { placeId: anchoredPlaceId } : {}),
          ...(matched ? { appRegionId: matched.regionId, appCityId: matched.cityId } : {}),
        });
      }
      /** 글쓰기 복귀 시 임시저장 이어쓰기 확인 시트가 가로채지 않도록(확인·취소 공통) */
      markTradeWriteSkipPersistedDraftPromptAfterMeetSpot();
      scheduleTradeWriteSheetReopenAfterMeetSpot(returnTo);
      setClosing(true);
      /** 520ms 대기는 체감 병목 — `closing` 페인트 1프레임 후 즉시 라우팅 */
      if (replaceNavRafRef.current != null) cancelAnimationFrame(replaceNavRafRef.current);
      replaceNavRafRef.current = requestAnimationFrame(() => {
        replaceNavRafRef.current = null;
        router.replace(returnTo);
      });
    },
    [anchoredPlaceId, closing, displayLine, fallbackCoordLine, geocodedLine, marker.lat, marker.lng, returnTo, router]
  );

  /**
   * 확인 — 핀(`marker`)을 단일 진실로 저장. 텍스트 박스는 표시 라벨일 뿐, 좌표를 다시 지오코딩해 덮으면
   * POI(상호) `geometry` 가 도로 좌표로 바뀌어 재진입 시 핀이 어긋남(스크린샷 사례).
   */
  const handleConfirm = useCallback(() => {
    if (closing) return;
    navigateBack({ saveResult: true });
  }, [closing, navigateBack]);

  const runNavigateBackWithoutSave = useCallback(() => {
    navigateBack({ saveResult: false });
  }, [navigateBack]);

  const handleCancel = useCallback(() => {
    if (closing) return;
    const settled = settledEntryRef.current;
    const cur: MeetSpotSnap = {
      lat: marker.lat,
      lng: marker.lng,
      displayLine: (displayLine.trim() || geocodedLine.trim()),
      placeId: anchoredPlaceId,
    };
    if (!settled || isMeetSpotSnapshotEqual(cur, settled)) {
      runNavigateBackWithoutSave();
      return;
    }
    setCancelChangeConfirmOpen(true);
  }, [
    anchoredPlaceId,
    closing,
    displayLine,
    geocodedLine,
    marker.lat,
    marker.lng,
    runNavigateBackWithoutSave,
  ]);

  const handleConfirmDiscardMeetSpotChange = useCallback(() => {
    setCancelChangeConfirmOpen(false);
    runNavigateBackWithoutSave();
  }, [runNavigateBackWithoutSave]);

  /** 고정 하단 버튼 높이 + safe-area — 스크롤 본문이 버튼 뒤에 숨지 않게 */
  const scrollBottomPad = "calc(5.75rem + var(--safe-bottom))";

  const representativeRestoreDisabled = useMemo(() => {
    if (!representativeCenter) return true;
    if (manualSearchQuery.trim()) return false;
    return distMetersMeetSpot(marker, representativeCenter) <= 20;
  }, [representativeCenter, marker.lat, marker.lng, manualSearchQuery]);

  return (
    <>
    <div
      className={`relative flex min-h-[100dvh] flex-col bg-sam-app transition-transform duration-500 ease-[cubic-bezier(0.22,0.9,0.32,1)] ${
        closing ? "-translate-y-full opacity-95" : entered ? "translate-y-0 opacity-100" : "-translate-y-full opacity-95"
      }`}
    >
      <header className="flex shrink-0 items-center justify-center border-b border-sam-border bg-sam-surface px-4 py-2.5">
        <h1 className="truncate text-center text-[15px] font-bold text-sam-fg">{t("trade_018")}</h1>
      </header>

      {mapsError ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <p className="sam-text-body-secondary text-sam-danger">{mapsError}</p>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="h-[38dvh] max-h-[min(48dvh,520px)] min-h-[200px] w-full shrink-0 sm:h-[42dvh]">
              <MapPicker
                marker={marker}
                onMarkerPositionChange={onMarkerChange}
                onPoiClick={onPoiClick}
                className="h-full min-h-[200px] w-full"
              />
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain border-t border-sam-border bg-sam-surface px-4 py-3"
              style={{ paddingBottom: scrollBottomPad }}
            >
              <div className="sam-form-field block">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-sam-fg">{t("trade_106")}</span>
                  {representativeCenter ? (
                    <button
                      type="button"
                      disabled={closing || representativeRestoreDisabled}
                      onClick={restoreRepresentativePin}
                      className="sam-text-helper shrink-0 rounded-sam-sm px-1 py-0.5 font-medium text-sam-primary underline-offset-2 hover:underline disabled:pointer-events-none disabled:opacity-40"
                    >
                      {t("trade_write_meet_spot_rep_address_reset")}
                    </button>
                  ) : null}
                </div>
                <div className="relative z-10">
                  <input
                    type="text"
                    value={manualSearchQuery}
                    inputMode="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    aria-label={t("trade_023")}
                    aria-autocomplete="list"
                    aria-expanded={addressPredictions.length > 0 && !addressPredictionsBusy}
                    onChange={(e) => {
                      userInteractionRef.current = true;
                      setManualSearchQuery(e.target.value);
                    }}
                    maxLength={200}
                    placeholder={t("trade_026")}
                    disabled={closing || predictionPickBusy}
                    className={`${Sam.input.base} rounded-ui-rect bg-sam-app shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-inset ring-sam-border disabled:opacity-60`}
                  />
                  {!addressPredictionsBusy && addressPredictions.length > 0 ? (
                    <ul
                      role="listbox"
                      aria-label={t("trade_105")}
                      className="absolute left-0 right-0 top-full z-[130] mt-1 max-h-52 overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface py-1 shadow-lg"
                    >
                      {addressPredictions.map((row) => (
                        <li key={row.placeId} role="presentation">
                          <button
                            type="button"
                            role="option"
                            disabled={predictionPickBusy || closing}
                            onMouseDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={() => {
                              void applyPlacePrediction(row);
                            }}
                            className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left sam-text-body text-sam-fg active:bg-sam-surface-muted disabled:opacity-50"
                          >
                            <span className="font-medium leading-snug">{row.mainText}</span>
                            {row.secondaryText ? (
                              <span className="text-[12px] leading-snug text-sam-muted">{row.secondaryText}</span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {addressPredictionsBusy ? (
                  <p className="mt-1.5 text-[12px] text-sam-muted" aria-live="polite">
                    {t("trade_write_meet_spot_searching")}
                  </p>
                ) : predictionPickBusy ? (
                  <p className="mt-1.5 text-[12px] text-sam-muted" aria-live="polite">
                    {t("trade_write_meet_spot_moving_pin")}
                  </p>
                ) : manualAddressForwardHint ? (
                  <p className="mt-1.5 text-[12px] text-sam-warning" role="status">
                    {manualAddressForwardHint}
                  </p>
                ) : null}
              </div>

              <label className="sam-form-field mt-3 block border-t border-sam-border pt-3">
                <span className="mb-1 block text-[13px] font-semibold text-sam-fg">{t("trade_127")}</span>
                <textarea
                  value={displayLine}
                  inputMode="text"
                  enterKeyHint="done"
                  autoComplete="street-address"
                  aria-label={t("trade_012")}
                  onChange={(e) => {
                    userInteractionRef.current = true;
                    setAddressTouched(true);
                    setDisplayLine(e.target.value);
                  }}
                  rows={3}
                  maxLength={240}
                  placeholder={
                    geocodeBusy
                      ? t("trade_write_meet_spot_geocode_busy")
                      : t("trade_write_meet_spot_display_placeholder")
                  }
                  className={`${Sam.input.textarea} resize-none rounded-ui-rect min-h-[96px] bg-sam-app shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-inset ring-sam-border`}
                />
              </label>
              <p className="mt-2 text-[12px] leading-snug text-sam-muted">
                {t("trade_write_meet_spot_cancel_hint")}
              </p>
            </div>
          </div>

          {domReady && typeof document !== "undefined"
            ? createPortal(
                <div
                  role="toolbar"
                  aria-label={t("trade_020")}
                  className={`fixed inset-x-0 bottom-0 z-[140] border-t border-sam-border bg-sam-surface px-3 pt-2 shadow-[0_-12px_32px_rgba(15,23,42,0.18)] pb-[max(0.65rem,var(--safe-bottom))] transition-transform duration-500 ease-[cubic-bezier(0.22,0.9,0.32,1)] ${
                    closing ? "-translate-y-full opacity-95" : entered ? "translate-y-0 opacity-100" : "-translate-y-full opacity-95"
                  }`}
                >
                  <div className="mx-auto flex w-full max-w-lg gap-2">
                    <button
                      type="button"
                      disabled={closing}
                      onClick={handleCancel}
                      className="flex-1 rounded-ui-rect border border-sam-border py-3.5 sam-text-body font-medium text-sam-fg active:bg-sam-surface-muted disabled:opacity-60"
                    >
                      {t("common_cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={closing}
                      onClick={handleConfirm}
                      className="flex-[1.4] rounded-ui-rect bg-signature py-3.5 sam-text-body font-semibold text-white shadow-sm disabled:opacity-40"
                    >
                      {t("trade_write_meet_spot_confirm_write")}
                    </button>
                  </div>
                </div>,
                document.body
              )
            : null}
        </>
      )}
    </div>
    <MobileConfirmBottomSheet
      open={cancelChangeConfirmOpen}
      onCancel={() => setCancelChangeConfirmOpen(false)}
      title={t("trade_019")}
      description={t("trade_write_meet_spot_exit_alt_body")}
      cancelLabel={t("trade_write_meet_spot_exit_alt_stay")}
      confirmLabel={t("trade_write_meet_spot_exit_alt_leave")}
      confirmTone="primary"
      onConfirm={handleConfirmDiscardMeetSpotChange}
      zIndexClass="z-[145]"
      ariaLabel={t("trade_write_meet_spot_exit_alt_aria")}
      interactionMode="blocking"
    />
    </>
  );
}
