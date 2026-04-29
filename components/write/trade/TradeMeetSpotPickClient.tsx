"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPicker, MAP_PICKER_DEFAULT_CENTER } from "@/components/map/MapPicker";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import {
  fetchProfileLatLngForMeetSpotMap,
  pickTradeMeetSpotCenterFromAddressDefaults,
} from "@/lib/map/initial-trade-meet-spot-center";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { resolveTradeMeetSpotDisplayLine } from "@/lib/map/resolve-trade-meet-spot-display-line";
import { buildPhFriendlyAddress, isSuitableEstablishmentDisplayName } from "@/lib/map/ph-friendly-address";
import {
  getTradeMeetSpotPickDraft,
  setTradeMeetSpotPickDraft,
  setTradeMeetSpotPickResult,
} from "@/lib/posts/trade-meet-spot-pick-storage";
import {
  normalizeTradeMeetSpotReturnTo,
  scheduleTradeWriteSheetReopenAfterMeetSpot,
} from "@/lib/navigation/trade-meet-spot-return-to";

type LatLng = { lat: number; lng: number };

function safeReturnPath(raw: string | null): string {
  if (!raw || typeof raw !== "string") return "/market";
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/market";
  if (t.length > 512) return "/market";
  return normalizeTradeMeetSpotReturnTo(t);
}

function useReverseGeocode(marker: LatLng): { text: string; busy: boolean } {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const runIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const runId = ++runIdRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await loadGoogleMaps();
        } catch {
          return;
        }
        if (cancelled || runId !== runIdRef.current) return;
        setBusy(true);
        try {
          const line = await resolveTradeMeetSpotDisplayLine(marker, () => cancelled || runId !== runIdRef.current);
          if (cancelled || runId !== runIdRef.current) return;
          setText(line);
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
  }, [marker.lat, marker.lng]);

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
  const { text: geocodedLine, busy: geocodeBusy } = useReverseGeocode(marker);
  const [displayLine, setDisplayLine] = useState("");
  /** 직접 수정 중이면 역지오 결과로 덮어쓰지 않음 — 핀 이동 시 리셋 */
  const [addressTouched, setAddressTouched] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const draftHydratedRef = useRef(false);
  /** 세션에 지도 초안이 있으면(이전 핀·글쓰기 시드) 사용자 주소로 덮어쓰지 않음 */
  const hadSessionPickDraftRef = useRef(false);
  /** 대표 주소 좌표 적용 전에는 세션 드래프트를 쓰지 않음 — 이전 세션의 기본 중심 좌표가 덮어쓰이지 않게 함 */
  const [initialPinReady, setInitialPinReady] = useState(false);
  const [domReady, setDomReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  /** 세션 초안 복원 — 서버/클라 HTML 불일치 없이 클라에서만 적용(뒤로가기 후 재입장 시 핀·표시 주소 유지) */
  useLayoutEffect(() => {
    const d = getTradeMeetSpotPickDraft();
    hadSessionPickDraftRef.current = Boolean(d);
    if (d) {
      setMarker({ lat: d.lat, lng: d.lng });
      setDisplayLine(d.displayLine);
      setAddressTouched(d.addressTouched);
      setInitialPinReady(true);
    }
    draftHydratedRef.current = true;
  }, []);

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
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [marker.lat, marker.lng, displayLine, addressTouched, initialPinReady]);

  const onMarkerChange = useCallback((m: LatLng) => {
    setAddressTouched(false);
    setMarker(m);
  }, []);

  /** 사용자가 지도 위 POI(상호 아이콘)를 직접 클릭 — 상호명을 즉시 표시 */
  const onPoiClick = useCallback(
    (info: { placeId: string; lat: number; lng: number }) => {
      void (async () => {
        try {
          await loadGoogleMaps();
        } catch {
          return;
        }
        const svc = new google.maps.places.PlacesService(document.createElement("div"));
        svc.getDetails(
          { placeId: info.placeId, fields: ["name", "address_components", "formatted_address"] },
          (place, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !place) return;
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
        });
      }
      scheduleTradeWriteSheetReopenAfterMeetSpot(returnTo);
      setClosing(true);
      window.setTimeout(() => {
        router.replace(returnTo);
      }, 520);
    },
    [closing, displayLine, geocodedLine, marker.lat, marker.lng, returnTo, router]
  );

  const handleConfirm = useCallback(() => {
    const line = displayLine.trim() || geocodedLine.trim();
    if (!line) return;
    navigateBack({ saveResult: true });
  }, [displayLine, geocodedLine, navigateBack]);

  const handleCancel = useCallback(() => {
    navigateBack({ saveResult: false });
  }, [navigateBack]);

  /** 고정 하단 버튼 높이 + safe-area — 스크롤 본문이 버튼 뒤에 숨지 않게 */
  const scrollBottomPad = "calc(5.75rem + env(safe-area-inset-bottom, 0px))";

  return (
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
  );
}
