"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useRouter } from "next/navigation";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { AddressSearch } from "@/components/map/AddressSearch";
import { MAP_PICKER_DEFAULT_CENTER, MapPicker } from "@/components/map/MapPicker";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { getBestCurrentPosition } from "@/lib/map/geolocation";
import {
  hideMapAddressRecentRow,
  pushMapAddressRecent,
  readHiddenMapAddressRecentKeys,
  readMapAddressRecent,
  writeMapAddressPick,
  mapAddressRecentRowKey,
  type MapAddressRecentItem,
} from "@/lib/map/map-address-pick-storage";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { buildMypageItemHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import {
  ADDR_BOTTOM_BAR,
  ADDR_BOTTOM_INNER,
  ADDR_BTN_PRIMARY_FULL,
  ADDR_BTN_TERTIARY_FULL,
  ADDR_BODY,
  ADDR_FLOW_MIN_VIEWPORT,
  ADDR_LIST_ROW_BTN,
  ADDR_MAP_HOST,
  ADDR_SECTION_LABEL,
  ADDR_SETTINGS_BODY,
} from "@/lib/ui/address-flow-viber";
import Link from "next/link";

type LatLng = { lat: number; lng: number };

type Step = "settings" | "map";

/** 위치 선택 화면: ① 지도에서 핀 맞춤 → ② 같은 화면에서 상세주소·확인 */
type MapPhase = "pin" | "detail";

function distMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function useReverseGeocode(marker: LatLng): { text: string; busy: boolean } {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await loadGoogleMaps();
        } catch {
          return;
        }
        if (cancelled) return;
        setBusy(true);
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: marker }, (results, status) => {
          if (cancelled) return;
          setBusy(false);
          if (status !== "OK" || !results?.[0]) {
            setText("");
            return;
          }
          setText(results[0].formatted_address ?? "");
        });
      })();
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [marker]);

  return { text, busy };
}

export function AddressSelectClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("settings");
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [marker, setMarker] = useState<LatLng>(MAP_PICKER_DEFAULT_CENTER);
  const [locating, setLocating] = useState(false);
  const [geoHint, setGeoHint] = useState<string | null>(null);
  const [serverAddresses, setServerAddresses] = useState<UserAddressDTO[]>([]);
  /** 연필 수정 또는 지도 이동 전까지 역지오코딩 대신 사용 */
  const [manualAddress, setManualAddress] = useState<string | null>(null);
  const manualAnchorRef = useRef<LatLng | null>(null);
  /** ②단계: 상세 한 줄(지번·건물명 등) */
  const [detailLine, setDetailLine] = useState("");
  const [mapPhase, setMapPhase] = useState<MapPhase>("pin");
  /** ①단계 끝에서 고정된 좌표·역지오코딩(또는 연필) 한 줄 */
  const [pinSnapshot, setPinSnapshot] = useState<{
    lat: number;
    lng: number;
    baseAddress: string;
  } | null>(null);
  /** localStorage 기반 최근 주소는 SSR·첫 페인트에서 제외 — hydration 불일치 방지 */
  const [recentLocalReady, setRecentLocalReady] = useState(false);
  /** 최근 목록에서 항목 삭제·숨김 후 재계산 */
  const [recentListVersion, setRecentListVersion] = useState(0);

  const { text: geocodedAddress, busy: geocodeBusy } = useReverseGeocode(marker);
  const displayAddress = geocodedAddress;

  const loadAddresses = useCallback(async () => {
    try {
      const res = await runSingleFlight("me:addresses:list", () =>
        fetch("/api/me/addresses", { credentials: "include", cache: "no-store" })
      );
      const j = (await res.json()) as { ok?: boolean; addresses?: UserAddressDTO[] };
      if (res.ok && j.ok && Array.isArray(j.addresses)) {
        setServerAddresses(j.addresses);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  useEffect(() => {
    setRecentLocalReady(true);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadGoogleMaps();
        setMapsError(null);
      } catch (e) {
        setMapsError(e instanceof Error ? e.message : "지도를 불러올 수 없습니다.");
      }
    })();
  }, []);

  const goToMap = useCallback((next: LatLng) => {
    setMarker(next);
    setManualAddress(null);
    manualAnchorRef.current = null;
    setDetailLine("");
    setMapPhase("pin");
    setPinSnapshot(null);
    setGeoHint(null);
    setStep("map");
  }, []);

  const onPlaceResolved = useCallback(
    (lat: number, lng: number, _formatted: string) => {
      goToMap({ lat, lng });
    },
    [goToMap],
  );

  const onCurrentLocation = useCallback(async () => {
    setGeoHint(null);
    setLocating(true);
    try {
      const res = await getBestCurrentPosition();
      if (!res.ok) {
        setGeoHint(res.message);
        return;
      }
      goToMap({ lat: res.latitude, lng: res.longitude });
    } finally {
      setLocating(false);
    }
  }, [goToMap]);

  const onMapMyLocation = useCallback(async () => {
    setGeoHint(null);
    setLocating(true);
    try {
      const res = await getBestCurrentPosition();
      if (!res.ok) {
        setGeoHint(res.message);
        return;
      }
      setMarker({ lat: res.latitude, lng: res.longitude });
      setManualAddress(null);
      manualAnchorRef.current = null;
    } finally {
      setLocating(false);
    }
  }, []);

  const recentMerged = useMemo(() => {
    const local = recentLocalReady ? readMapAddressRecent() : [];
    const fromDb: MapAddressRecentItem[] = serverAddresses
      .filter((a) => a.latitude != null && a.longitude != null && (a.fullAddress?.trim() || a.streetAddress?.trim()))
      .slice(0, 8)
      .map((a) => ({
        latitude: a.latitude!,
        longitude: a.longitude!,
        address: (a.fullAddress ?? a.streetAddress ?? "").trim(),
        at: new Date(a.updatedAt).getTime(),
      }));
    const seen = new Set<string>();
    const out: MapAddressRecentItem[] = [];
    for (const x of [...local, ...fromDb].sort((a, b) => b.at - a.at)) {
      const key = `${x.latitude.toFixed(5)},${x.longitude.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(x);
      if (out.length >= 10) break;
    }
    const hidden = readHiddenMapAddressRecentKeys();
    return out.filter((r) => !hidden.has(mapAddressRecentRowKey(r)));
  }, [serverAddresses, recentLocalReady, recentListVersion]);

  const removeRecentRow = useCallback((r: MapAddressRecentItem) => {
    hideMapAddressRecentRow(r);
    setRecentListVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!manualAddress || !manualAnchorRef.current) return;
    if (distMeters(marker, manualAnchorRef.current) > 40) {
      setManualAddress(null);
      manualAnchorRef.current = null;
    }
  }, [marker.lat, marker.lng, manualAddress]);

  const shownAddressPin = (manualAddress ?? displayAddress).trim();
  const pinPrimaryDisabled =
    !shownAddressPin || (geocodeBusy && !manualAddress) || Boolean(mapsError);

  const onPinConfirm = useCallback(() => {
    const addr = (manualAddress ?? displayAddress).trim();
    if (!addr || mapsError) return;
    setPinSnapshot({ lat: marker.lat, lng: marker.lng, baseAddress: addr });
    setMapPhase("detail");
    setDetailLine("");
  }, [displayAddress, manualAddress, marker.lat, marker.lng, mapsError]);

  const onFinalConfirm = useCallback(() => {
    if (!pinSnapshot || mapsError) return;
    const detail = detailLine.trim();
    writeMapAddressPick({
      latitude: pinSnapshot.lat,
      longitude: pinSnapshot.lng,
      fullAddress: pinSnapshot.baseAddress,
      addressDetail: detail || null,
    });
    pushMapAddressRecent({
      latitude: pinSnapshot.lat,
      longitude: pinSnapshot.lng,
      address: detail ? `${pinSnapshot.baseAddress} · ${detail}` : pinSnapshot.baseAddress,
    });
    router.back();
  }, [detailLine, pinSnapshot, mapsError, router]);

  const mapMarkerPos =
    mapPhase === "detail" && pinSnapshot
      ? { lat: pinSnapshot.lat, lng: pinSnapshot.lng }
      : marker;

  const openAddressEdit = useCallback(() => {
    const v = window.prompt("주소 수정", shownAddressPin || displayAddress.trim());
    if (v == null) return;
    const t = v.trim();
    if (t) {
      setManualAddress(t);
      manualAnchorRef.current = marker;
    }
  }, [displayAddress, marker, shownAddressPin]);

  return (
    <div className={ADDR_FLOW_MIN_VIEWPORT}>
      {step === "settings" ? (
        <MySubpageHeader title="주소 설정" backHref="/mypage" hideCtaStrip showHubQuickActions={false} />
      ) : (
        <MySubpageHeader
          title="위치 선택"
          backHref="/mypage"
          hideCtaStrip
          showHubQuickActions={false}
          leftSlot={
            <AppBackButton
              preferHistoryBack={false}
              onBack={() => {
                if (mapPhase === "detail") {
                  setMapPhase("pin");
                  setPinSnapshot(null);
                  setDetailLine("");
                  return;
                }
                setStep("settings");
                setGeoHint(null);
                setManualAddress(null);
                manualAnchorRef.current = null;
                setDetailLine("");
              }}
              ariaLabel="뒤로"
              className="text-sam-fg hover:bg-sam-primary-soft/50"
            />
          }
        />
      )}
      {step === "settings" ? (
        <>
          <div className={ADDR_SETTINGS_BODY}>
            {mapsError ? (
              <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">{mapsError}</p>
            ) : null}
            <AddressSearch onPlaceResolved={onPlaceResolved} />
            <button
              type="button"
              onClick={() => void onCurrentLocation()}
              disabled={locating || Boolean(mapsError)}
              className="flex w-full items-center justify-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface py-3.5 sam-text-body font-medium text-sam-muted disabled:opacity-50"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M12 5V2M12 22v-3M5 12H2M22 12h-3M6.3 6.3 4.9 4.9M19.1 19.1 17.7 17.7M17.7 6.3 19.1 4.9M6.3 17.7 4.9 19.1"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              {locating ? "위치 확인 중…" : "현재 위치로 찾기"}
            </button>
            {geoHint ? <p className="sam-text-body-secondary leading-snug text-red-700">{geoHint}</p> : null}

            <div>
              <p className={ADDR_SECTION_LABEL}>최근 주소</p>
              <ul className="space-y-1">
                {recentMerged.length === 0 ? (
                  <li className={`sam-text-body-secondary ${ADDR_BODY}`}>최근 검색 기록이 없습니다.</li>
                ) : (
                  recentMerged.map((r) => (
                    <li key={mapAddressRecentRowKey(r)} className="flex items-stretch gap-1">
                      <button
                        type="button"
                        onClick={() => goToMap({ lat: r.latitude, lng: r.longitude })}
                        className={ADDR_LIST_ROW_BTN}
                      >
                        {r.address}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecentRow(r)}
                        className="flex h-auto min-w-[44px] shrink-0 items-center justify-center rounded-ui-rect px-2 sam-text-body-secondary text-sam-muted hover:bg-sam-primary-soft/40 hover:text-sam-fg"
                        aria-label="최근 주소 목록에서 삭제"
                      >
                        삭제
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => goToMap(marker)}
              disabled={Boolean(mapsError)}
              className="w-full rounded-ui-rect border border-dashed border-sam-primary-border/70 bg-sam-surface py-3 sam-text-body font-medium text-signature disabled:opacity-40"
            >
              지도에서 직접 선택
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={`relative min-h-0 flex-1 ${ADDR_MAP_HOST}`}>
            {mapsError ? (
              <div className="flex h-full items-center justify-center p-4 text-center text-sm text-sam-muted">
                환경 변수 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 를 확인해 주세요.
              </div>
            ) : (
              <>
                <MapPicker
                  mode="center"
                  marker={mapMarkerPos}
                  onMarkerPositionChange={mapPhase === "detail" ? () => {} : setMarker}
                  interactionLocked={mapPhase === "detail"}
                  className="absolute inset-0 h-full w-full"
                />
                <button
                  type="button"
                  onClick={() => void onMapMyLocation()}
                  disabled={locating || mapPhase === "detail"}
                  className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-sam-border bg-sam-surface shadow-md disabled:opacity-50"
                  aria-label="현재 위치로 이동"
                >
                  <svg className="h-6 w-6 text-sam-fg" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                    <path
                      d="M12 5V2M12 22v-3M5 12H2M22 12h-3M6.3 6.3 4.9 4.9M19.1 19.1 17.7 17.7M17.7 6.3 19.1 4.9M6.3 17.7 4.9 19.1"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </>
            )}
          </div>

          <div className={ADDR_BOTTOM_BAR}>
            <div className={ADDR_BOTTOM_INNER}>
              {geoHint ? <p className="sam-text-helper text-red-700">{geoHint}</p> : null}
              {mapPhase === "pin" ? (
                <>
                  <p className="sam-text-helper font-medium text-sam-muted">선택한 위치</p>
                  <div className="flex items-start gap-2 rounded-ui-rect bg-sam-app px-3 py-2.5">
                    <p className={`min-h-[44px] flex-1 sam-text-body ${ADDR_BODY} text-sam-fg`}>
                      {geocodeBusy && !manualAddress
                        ? "주소를 불러오는 중…"
                        : shownAddressPin || "지도를 움직여 주소를 지정하세요."}
                    </p>
                    <button
                      type="button"
                      onClick={openAddressEdit}
                      className="shrink-0 rounded-ui-rect p-2 text-sam-muted hover:bg-sam-primary-soft/40 hover:text-sam-fg"
                      aria-label="주소 수정"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.83L17.33 5.5a2 2 0 0 0-2.83 0L4 15.5V20z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={pinPrimaryDisabled}
                    onClick={onPinConfirm}
                    className={ADDR_BTN_PRIMARY_FULL}
                  >
                    선택한 위치로 설정
                  </button>
                </>
              ) : (
                <>
                  <p className="sam-text-helper font-medium text-sam-muted">선택한 위치</p>
                  <div className={`rounded-ui-rect bg-sam-app px-3 py-2.5 sam-text-body ${ADDR_BODY} text-sam-fg`}>
                    {pinSnapshot?.baseAddress ?? ""}
                  </div>
                  <label className="block">
                    <span className="mb-1 block sam-text-helper font-medium text-sam-muted">상세주소</span>
                    <textarea
                      value={detailLine}
                      onChange={(e) => setDetailLine(e.target.value)}
                      rows={2}
                      placeholder="상세주소 (지번, 건물명, 호텔명을 입력하세요)"
                      className="w-full resize-none rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2.5 sam-text-body text-sam-fg placeholder:text-sam-muted"
                      autoComplete="street-address"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!pinSnapshot || Boolean(mapsError)}
                    onClick={onFinalConfirm}
                    className={ADDR_BTN_PRIMARY_FULL}
                  >
                    확인
                  </button>
                </>
              )}
              <Link
                href={buildMypageItemHref("settings", "address")}
                className={`block pb-1 text-center ${ADDR_BTN_TERTIARY_FULL}`}
              >
                주소 목록
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
