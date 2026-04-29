"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPicker, MAP_PICKER_DEFAULT_CENTER } from "@/components/map/MapPicker";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";
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

function firstComponentByTypes(
  components: google.maps.GeocoderAddressComponent[],
  types: string[]
): string | null {
  for (const t of types) {
    const hit = components.find((c) => c.types?.includes(t));
    const value = (hit?.long_name ?? hit?.short_name ?? "").trim();
    if (value) return value;
  }
  return null;
}

function buildRoadLine(components: google.maps.GeocoderAddressComponent[]): string | null {
  const streetNumber = firstComponentByTypes(components, ["street_number"]);
  const route = firstComponentByTypes(components, ["route"]);
  const premiseRoad = [streetNumber, route].filter(Boolean).join(" ").trim();
  if (premiseRoad) return premiseRoad;
  const routeOnly = (route ?? "").trim();
  return routeOnly || null;
}

function buildPhilippinesAddressLine(components: google.maps.GeocoderAddressComponent[]): string | null {
  const road = buildRoadLine(components);
  const barangay = firstComponentByTypes(components, [
    "sublocality_level_1",
    "sublocality",
    "neighborhood",
  ]);
  const city = firstComponentByTypes(components, ["locality", "administrative_area_level_2"]);
  const provinceOrMetro = firstComponentByTypes(components, ["administrative_area_level_1"]);
  const parts = uniqueTruthy([road, barangay, city, provinceOrMetro]);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

function buildPhilippinesAdminLine(components: google.maps.GeocoderAddressComponent[]): string | null {
  const districtOrBarangay = firstComponentByTypes(components, [
    "sublocality_level_1",
    "sublocality",
    "neighborhood",
  ]);
  const city = firstComponentByTypes(components, ["locality", "administrative_area_level_2"]);
  const provinceOrMetro = firstComponentByTypes(components, ["administrative_area_level_1"]);
  /** 필리핀 로컬 표기: Barangay/구역, City/Municipality, Province/Metro */
  const parts = uniqueTruthy([districtOrBarangay, city, provinceOrMetro]);
  if (parts.length === 0) return null;
  return parts.join(" ");
}

function pickBuildingOrPlaceName(result: google.maps.GeocoderResult): string | null {
  const components = result.address_components ?? [];
  return firstComponentByTypes(components, [
    "premise",
    "point_of_interest",
    "establishment",
    "subpremise",
    "neighborhood",
  ]);
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function stripCountryAndZip(raw: string): string {
  let s = raw;
  /** PH zip(4자리) + 일반 우편번호 패턴 일부 정리 (도로 번지는 보존) */
  s = s.replace(/(?:^|[,\s])\d{4}(?=$|[,\s])/g, " ");
  s = s.replace(/(?:^|[,\s])[A-Z]\d[A-Z]\s?\d[A-Z]\d(?=$|[,\s])/gi, " "); // CA-style fallback
  /** 국가명 표기 제거 (영문/국문 혼용) */
  s = s.replace(
    /\b(Philippines|Republic of the Philippines|PH|Pilipinas|Republika ng Pilipinas)\b/gi,
    ""
  );
  s = s.replace(/필리핀/g, "");
  /** 구분자 정리 */
  s = s.replace(/\s*,\s*/g, ", ");
  s = s.replace(/(?:,\s*){2,}/g, ", ");
  s = s.replace(/^,\s*|\s*,\s*$/g, "");
  return normalizeWhitespace(s);
}

function extractRoadFromFormattedAddress(formatted: string): string | null {
  const patterns = [
    /\b\d{1,6}\s+[A-Za-z0-9.'-]+\s+(?:St|Street|Ave|Avenue|Road|Rd|Blvd|Boulevard|Dr|Drive|Lane|Ln)\b/i,
    /\b[A-Za-z0-9.'-]+\s+(?:St|Street|Ave|Avenue|Road|Rd|Blvd|Boulevard|Dr|Drive|Lane|Ln)\b/i,
  ];
  for (const p of patterns) {
    const m = formatted.match(p);
    if (m?.[0]) return m[0].trim();
  }
  return null;
}

function uniqueTruthy(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of values) {
    const t = (v ?? "").trim();
    if (!t) continue;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
  }
  return out;
}

function mergeUniqueAddressParts(values: Array<string | null | undefined>): string {
  const parts = uniqueTruthy(values);
  if (parts.length === 0) return "";
  return parts.join(", ");
}

function normalizePlaceName(name: string | null | undefined): string | null {
  const n = stripCountryAndZip((name ?? "").replace(/\s*-\s*Philippines$/i, ""));
  if (!n) return null;
  return n;
}

function buildDisplayLineFromGeocode(
  results: google.maps.GeocoderResult[],
  placeNameHint?: string | null
): string {
  const merchantName =
    normalizePlaceName(
      uniqueTruthy([placeNameHint, ...results.map((r) => pickBuildingOrPlaceName(r))])[0] ?? null
    ) ?? null;

  const adminLine =
    uniqueTruthy(results.map((r) => buildPhilippinesAdminLine(r.address_components ?? [])))[0] ?? null;
  /** 요청 형식: 상호명, 동/구/군/시 */
  if (adminLine && merchantName) return stripCountryAndZip(`${merchantName}, ${adminLine}`);
  if (merchantName) return merchantName;
  if (adminLine) return stripCountryAndZip(adminLine);
  /** 최후 폴백(상호/행정정보 모두 없을 때만) */
  const primaryFormatted = stripCountryAndZip((results[0]?.formatted_address ?? "").trim());
  return primaryFormatted;
}

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

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await loadGoogleMaps();
        } catch {
          return;
        }
        if (cancelled) return;
        setBusy(true);
        const geocoder = new google.maps.Geocoder();
        const places = new google.maps.places.PlacesService(document.createElement("div"));

        void (async () => {
          const { results: geoResults, status: geoStatus } = await new Promise<{
            results: google.maps.GeocoderResult[];
            status: google.maps.GeocoderStatus;
          }>((resolve) => {
            geocoder.geocode({ location: marker }, (results, status) => {
              resolve({ results: results ?? [], status });
            });
          });

          if (cancelled) return;
          if (geoStatus !== "OK" || !geoResults?.[0]) {
            setBusy(false);
            setText("");
            return;
          }

          let placeName: string | null = null;
          const primaryPlaceId = geoResults[0]?.place_id;

          if (primaryPlaceId) {
            placeName = await new Promise<string | null>((resolve) => {
              places.getDetails(
                { placeId: primaryPlaceId, fields: ["name"] },
                (place, status) => {
                  if (status === google.maps.places.PlacesServiceStatus.OK) {
                    resolve((place?.name ?? "").trim() || null);
                  } else {
                    resolve(null);
                  }
                }
              );
            });
          }

          if (!placeName) {
            placeName = await new Promise<string | null>((resolve) => {
              places.nearbySearch(
                {
                  location: marker,
                  radius: 60,
                  type: "establishment",
                },
                (results, status) => {
                  if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) {
                    resolve(null);
                    return;
                  }
                  const nearest = results
                    .filter((r) => typeof r.name === "string" && r.name.trim().length > 0)
                    .sort((a, b) => {
                      const da =
                        a.geometry?.location
                          ? google.maps.geometry.spherical.computeDistanceBetween(
                              a.geometry.location,
                              new google.maps.LatLng(marker.lat, marker.lng)
                            )
                          : Number.MAX_SAFE_INTEGER;
                      const db =
                        b.geometry?.location
                          ? google.maps.geometry.spherical.computeDistanceBetween(
                              b.geometry.location,
                              new google.maps.LatLng(marker.lat, marker.lng)
                            )
                          : Number.MAX_SAFE_INTEGER;
                      return da - db;
                    })[0];
                  resolve((nearest?.name ?? "").trim() || null);
                }
              );
            });
          }

          if (cancelled) return;
          setBusy(false);
          setText(buildDisplayLineFromGeocode(geoResults, placeName));
        })();
      })();
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
  const [domReady, setDomReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  /** 세션 초안 복원 — 서버/클라 HTML 불일치 없이 클라에서만 적용(뒤로가기 후 재입장 시 핀·표시 주소 유지) */
  useLayoutEffect(() => {
    const d = getTradeMeetSpotPickDraft();
    if (d) {
      setMarker({ lat: d.lat, lng: d.lng });
      setDisplayLine(d.displayLine);
      setAddressTouched(d.addressTouched);
    }
    draftHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const t = window.setTimeout(() => {
      setTradeMeetSpotPickDraft({
        lat: marker.lat,
        lng: marker.lng,
        displayLine,
        addressTouched,
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [marker.lat, marker.lng, displayLine, addressTouched]);

  const onMarkerChange = useCallback((m: LatLng) => {
    setAddressTouched(false);
    setMarker(m);
  }, []);

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
        const line = displayLine.trim();
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
    [closing, displayLine, marker.lat, marker.lng, returnTo, router]
  );

  const handleConfirm = useCallback(() => {
    const line = displayLine.trim();
    if (!line) return;
    navigateBack({ saveResult: true });
  }, [displayLine, navigateBack]);

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
                      disabled={!displayLine.trim() || closing}
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
