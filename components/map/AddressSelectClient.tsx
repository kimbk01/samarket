"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AddressSearch } from "@/components/map/AddressSearch";
import { MAP_PICKER_DEFAULT_CENTER, MapPicker } from "@/components/map/MapPicker";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import {
  pushMapAddressRecent,
  readMapAddressRecent,
  writeMapAddressPick,
  type MapAddressRecentItem,
} from "@/lib/map/map-address-pick-storage";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { buildMypageItemHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import Link from "next/link";

type LatLng = { lat: number; lng: number };

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
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [marker]);

  return { text, busy };
}

export function AddressSelectClient() {
  const router = useRouter();
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [marker, setMarker] = useState<LatLng>(MAP_PICKER_DEFAULT_CENTER);
  const [locating, setLocating] = useState(false);
  const [serverAddresses, setServerAddresses] = useState<UserAddressDTO[]>([]);

  const { text: geocodedAddress, busy: geocodeBusy } = useReverseGeocode(marker);

  const displayAddress = geocodedAddress;

  const loadAddresses = useCallback(async () => {
    try {
      const res = await fetch("/api/me/addresses", { credentials: "include", cache: "no-store" });
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
    void (async () => {
      try {
        await loadGoogleMaps();
        setMapsError(null);
      } catch (e) {
        setMapsError(e instanceof Error ? e.message : "지도를 불러올 수 없습니다.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setMarker({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 14_000, maximumAge: 60_000 }
    );
  }, []);

  const onPlaceResolved = useCallback((lat: number, lng: number, _formatted: string) => {
    setMarker({ lat, lng });
  }, []);

  const onCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setMarker({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 14_000 }
    );
  }, []);

  const recentMerged = useMemo(() => {
    const local = readMapAddressRecent();
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
    return out;
  }, [serverAddresses]);

  const confirmDisabled = !displayAddress.trim() || geocodeBusy || Boolean(mapsError);

  const onConfirm = useCallback(() => {
    const addr = displayAddress.trim();
    if (!addr || mapsError) return;
    writeMapAddressPick({
      latitude: marker.lat,
      longitude: marker.lng,
      fullAddress: addr,
    });
    pushMapAddressRecent({
      latitude: marker.lat,
      longitude: marker.lng,
      address: addr,
    });
    router.back();
  }, [displayAddress, marker.lat, marker.lng, mapsError, router]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-page">
      <header className="shrink-0 border-b border-ig-border bg-ui-surface px-3 py-2">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 min-w-[44px] items-center justify-center rounded-ui-rect text-ui-fg"
            aria-label="뒤로"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <h1 className="flex-1 text-center text-[16px] font-semibold text-ui-fg">위치 선택</h1>
          <span className="w-11" aria-hidden />
        </div>
      </header>

      <div className="shrink-0 space-y-2 border-b border-ig-border bg-ui-surface px-3 py-2">
        {mapsError ? (
          <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{mapsError}</p>
        ) : null}
        <AddressSearch onPlaceResolved={onPlaceResolved} />
        <button
          type="button"
          onClick={onCurrentLocation}
          disabled={locating || Boolean(mapsError)}
          className="flex w-full items-center justify-center gap-2 rounded-ui-rect border border-ig-border bg-ui-surface py-3 text-[14px] font-medium text-ui-fg disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
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
      </div>

      <div className="shrink-0 px-3 py-2">
        <p className="mb-1 text-[13px] font-semibold text-ui-fg">최근 주소</p>
        <ul className="max-h-[28vh] space-y-1 overflow-y-auto">
          {recentMerged.length === 0 ? (
            <li className="text-[13px] text-ui-muted">저장된 최근 주소가 없습니다.</li>
          ) : (
            recentMerged.map((r) => (
              <li key={`${r.latitude},${r.longitude},${r.at}`}>
                <button
                  type="button"
                  onClick={() => setMarker({ lat: r.latitude, lng: r.longitude })}
                  className="w-full rounded-ui-rect border border-transparent px-2 py-2 text-left text-[13px] text-ui-fg hover:border-ig-border hover:bg-ui-hover"
                >
                  {r.address}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="relative min-h-0 flex-1">
        {mapsError ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-ui-muted">
            환경 변수 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 를 확인해 주세요.
          </div>
        ) : (
          <>
            <MapPicker marker={marker} onMarkerPositionChange={setMarker} className="absolute inset-0 h-full w-full" />
          </>
        )}
      </div>

      <div className="safe-area-pb shrink-0 border-t border-ig-border bg-ui-surface px-3 pt-2">
        <div className="mx-auto flex max-w-lg flex-col gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start gap-2 rounded-ui-rect bg-ui-page px-3 py-2">
            <p className="min-h-[44px] flex-1 text-[14px] leading-snug text-ui-fg">
              {geocodeBusy ? "주소를 불러오는 중…" : displayAddress || "지도를 탭하거나 핀을 움직여 주소를 지정하세요."}
            </p>
          </div>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
            className="w-full rounded-ui-rect bg-signature py-3.5 text-[15px] font-semibold text-white disabled:opacity-40"
          >
            선택한 위치로 설정
          </button>
          <p className="text-center text-[12px] text-ui-muted">
            다음 화면에서 세부 정보를 입력한 뒤 <span className="font-medium text-ui-fg">저장</span>을 눌러 주세요.
          </p>
          <Link
            href={buildMypageItemHref("settings", "address")}
            className="pb-1 text-center text-[13px] text-ui-muted underline"
          >
            주소 목록으로
          </Link>
        </div>
      </div>
    </div>
  );
}
