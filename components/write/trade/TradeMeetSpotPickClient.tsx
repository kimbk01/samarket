"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPicker, MAP_PICKER_DEFAULT_CENTER } from "@/components/map/MapPicker";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { geocodeDisplayLineToLatLng } from "@/lib/map/geocode-display-line-to-lat-lng";
import {
  fetchMeetSpotPinFallbackCenter,
  fetchProfileLatLngForMeetSpotMap,
  pickTradeMeetSpotCenterFromAddressDefaults,
} from "@/lib/map/initial-trade-meet-spot-center";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";
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
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";

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
      const svc = new google.maps.places.PlacesService(document.createElement("div"));
      svc.getDetails({ placeId: sid, fields: ["geometry", "place_id"] }, (place, status) => {
        if (isStale() || addressTouchedRef.current) return;
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) return;
        const loc = place.geometry.location;
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
        const pid = (place as { place_id?: string }).place_id?.trim() || sid;
        setAnchoredPlaceId(pid);
      });
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
      const svc = new google.maps.places.PlacesService(document.createElement("div"));
      svc.getDetails({ placeId: id, fields: ["geometry", "place_id"] }, (place, status) => {
        if (cancelled) return;
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          const loc = place.geometry.location;
          setMarker({ lat: loc.lat(), lng: loc.lng() });
          const resolvedPid = (place as { place_id?: string }).place_id?.trim();
          if (resolvedPid) setAnchoredPlaceId(resolvedPid);
        }
        setGeometryResolveTarget(null);
        setInitialPinReady(true);
      });
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
        const snap = await fetchAddressDefaultsSnapshot();
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
    setMarker(m);
  }, []);

  /** 사용자가 지도 위 POI(상호 아이콘)를 직접 클릭 — 상호명 표시 + 핀은 장소 좌표(geometry)에 맞춤 (클릭한 도로와 상호 주소 불일치 방지) */
  const onPoiClick = useCallback(
    (info: { placeId: string; lat: number; lng: number }) => {
      userInteractionRef.current = true;
      /** getDetails 전에 동기로 막음 — 역지오가 도로 주소로 displayLine 을 덮어쓰지 않게 */
      setAddressTouched(true);
      setAnchoredPlaceId(info.placeId.trim());
      void (async () => {
        try {
          await loadGoogleMaps();
        } catch {
          return;
        }
        const svc = new google.maps.places.PlacesService(document.createElement("div"));
        svc.getDetails(
          {
            placeId: info.placeId,
            fields: ["name", "address_components", "formatted_address", "geometry"],
          },
          (place, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
              setMarker({ lat: info.lat, lng: info.lng });
              return;
            }
            const loc = place.geometry?.location;
            if (loc) {
              setMarker({ lat: loc.lat(), lng: loc.lng() });
            } else {
              setMarker({ lat: info.lat, lng: info.lng });
            }
            const stablePid = (place as { place_id?: string }).place_id?.trim() || info.placeId.trim();
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
          }
        );
      })();
    },
    []
  );

  useEffect(() => {
    if (!geocodedLine || addressTouched) return;
    setDisplayLine(geocodedLine);
  }, [geocodedLine, addressTouched]);

  useEffect(() => {
    void loadGoogleMaps().catch(() => setMapsError("지도를 불러올 수 없습니다."));
  }, []);

  useEffect(() => {
    setDomReady(true);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const navigateBack = useCallback(
    (opts: { saveResult: boolean }) => {
      if (closing) return;
      if (opts.saveResult) {
        const line = displayLine.trim() || geocodedLine.trim();
        if (!line) return;
        setTradeMeetSpotPickResult({
          displayLine: line,
          lat: marker.lat,
          lng: marker.lng,
          ...(anchoredPlaceId ? { placeId: anchoredPlaceId } : {}),
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
    [anchoredPlaceId, closing, displayLine, geocodedLine, marker.lat, marker.lng, returnTo, router]
  );

  /**
   * 확인 — 핀(`marker`)을 단일 진실로 저장. 텍스트 박스는 표시 라벨일 뿐, 좌표를 다시 지오코딩해 덮으면
   * POI(상호) `geometry` 가 도로 좌표로 바뀌어 재진입 시 핀이 어긋남(스크린샷 사례).
   */
  const handleConfirm = useCallback(() => {
    if (closing) return;
    const line = displayLine.trim() || geocodedLine.trim();
    if (!line) return;
    navigateBack({ saveResult: true });
  }, [closing, displayLine, geocodedLine, navigateBack]);

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
  const scrollBottomPad = "calc(5.75rem + env(safe-area-inset-bottom, 0px))";

  return (
    <>
    <div
      className={`relative flex min-h-[100dvh] flex-col bg-sam-app transition-transform duration-500 ease-[cubic-bezier(0.22,0.9,0.32,1)] ${
        closing ? "-translate-y-full opacity-95" : entered ? "translate-y-0 opacity-100" : "-translate-y-full opacity-95"
      }`}
    >
      <header className="flex shrink-0 items-center justify-center border-b border-sam-border bg-sam-surface px-4 py-2.5">
        <h1 className="truncate text-center text-[15px] font-bold text-sam-fg">거래 희망 장소</h1>
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
              <p className="sam-text-body-secondary text-sam-muted">
                핀을 옮겨 만남 위치를 정한 뒤, 아래 주소를 필요하면 짧게 다듬은 다음{" "}
                <span className="font-medium text-sam-fg">하단 고정</span>의「이 주소로 확인 · 글쓰기로」를 누르세요.
              </p>
              <label className="mt-3 block">
                <span className="mb-1 block text-[13px] font-semibold text-sam-fg">표시할 주소</span>
                <textarea
                  value={displayLine}
                  onChange={(e) => {
                    userInteractionRef.current = true;
                    setAddressTouched(true);
                    setDisplayLine(e.target.value);
                  }}
                  rows={4}
                  maxLength={240}
                  placeholder={geocodeBusy ? "주소 불러오는 중…" : "지도에서 선택한 위치의 주소가 여기에 표시됩니다."}
                  className="w-full resize-none rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg outline-none focus:border-sam-primary"
                />
              </label>
              <p className="mt-2 text-[12px] leading-snug text-sam-muted">
                「취소」는 주소를 저장하지 않고 거래 글쓰기로 돌아갑니다.
              </p>
            </div>
          </div>

          {domReady && typeof document !== "undefined"
            ? createPortal(
                <div
                  role="toolbar"
                  aria-label="거래 희망 장소 확인"
                  className={`fixed inset-x-0 bottom-0 z-[140] border-t border-sam-border bg-sam-surface px-3 pt-2 shadow-[0_-12px_32px_rgba(15,23,42,0.18)] pb-[max(0.65rem,env(safe-area-inset-bottom,0px))] transition-transform duration-500 ease-[cubic-bezier(0.22,0.9,0.32,1)] ${
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
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={(!displayLine.trim() && !geocodedLine.trim()) || closing}
                      onClick={handleConfirm}
                      className="flex-[1.4] rounded-ui-rect bg-signature py-3.5 sam-text-body font-semibold text-white shadow-sm disabled:opacity-40"
                    >
                      이 주소로 확인 · 글쓰기로
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
      title="거래 희망 장소 변경을 취소할까요?"
      description="지도에서 바꾼 위치는 저장되지 않고 글쓰기로 돌아갑니다."
      cancelLabel="계속 수정"
      confirmLabel="변경 취소 후 나가기"
      confirmTone="primary"
      onConfirm={handleConfirmDiscardMeetSpotChange}
      zIndexClass="z-[145]"
      ariaLabel="거래 희망 장소 변경 취소 확인"
      interactionMode="blocking"
    />
    </>
  );
}
