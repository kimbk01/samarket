"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { tapHaptic } from "@/lib/ui/tap-haptic";

/**
 * 지도 위치 확인(주소 입력 시안 3번) — 핀은 화면 가운데 고정, 사용자가 지도를 움직인다.
 * - 끄는 동안 핀이 떠오르고 그림자가 작아짐 → 손을 떼면(지도 idle) 내려앉고 진동 1회 + `onCenterSettled`
 * - 첫 표시(코드가 옮긴 지도)는 `onCenterSettled` 를 부르지 않는다 — 사용자가 끈 경우만
 */
export function AddressCenterPinMapClient(props: {
  latitude: number;
  longitude: number;
  onCenterSettled: (lat: number, lng: number) => void;
  /** 핀 위 안내 말풍선 */
  hint?: string | null;
  /** 바깥에서 지도를 이 좌표로 옮기라는 요청(내 위치) — 값이 바뀔 때마다 이동 */
  recenterTo?: { lat: number; lng: number; seq: number } | null;
}) {
  const { latitude, longitude, onCenterSettled, hint, recenterTo } = props;
  const { t } = useI18n();
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [lifted, setLifted] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const userMovingRef = useRef(false);
  const settledRef = useRef(onCenterSettled);
  settledRef.current = onCenterSettled;

  useEffect(() => {
    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];
    void (async () => {
      try {
        await loadGoogleMaps();
      } catch {
        if (!cancelled) setLoadFailed(true);
        return;
      }
      if (cancelled || !containerRef.current) return;
      const map = new google.maps.Map(containerRef.current, {
        center: { lat: latitude, lng: longitude },
        zoom: 18,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: false,
        gestureHandling: "greedy",
        keyboardShortcuts: false,
        clickableIcons: false,
      });
      mapRef.current = map;
      listeners.push(
        map.addListener("dragstart", () => {
          userMovingRef.current = true;
          setLifted(true);
        }),
        map.addListener("idle", () => {
          if (!userMovingRef.current) return;
          userMovingRef.current = false;
          setLifted(false);
          tapHaptic("drop");
          const c = map.getCenter();
          if (c) settledRef.current(c.lat(), c.lng());
        }),
      );
    })();
    return () => {
      cancelled = true;
      for (const l of listeners) l.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트(또는 재시도) 시 한 번만 지도 생성
  }, [loadAttempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !recenterTo) return;
    /** 내 위치로 이동도 사용자가 고른 위치 — 내려앉은 뒤 주소 갱신 */
    userMovingRef.current = true;
    map.panTo({ lat: recenterTo.lat, lng: recenterTo.lng });
  }, [recenterTo]);

  if (loadFailed) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-3 bg-sam-surface-muted px-4 text-center"
        role="alert"
        data-testid="address-center-pin-map-error"
      >
        <p className="sam-text-body-secondary font-medium text-sam-muted">{t("addr_ui_maps_load_failed")}</p>
        <button
          type="button"
          onClick={() => {
            setLoadFailed(false);
            setLoadAttempt((n) => n + 1);
          }}
          className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing} sam-press`}
        >
          {t("common_retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-sam-surface-muted">
      <div ref={containerRef} className="absolute inset-0" role="presentation" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
        {hint ? (
          <span className="mb-3 whitespace-nowrap rounded-ui-rect bg-sam-fg px-3 py-2 sam-text-helper font-medium text-sam-surface">
            {hint}
          </span>
        ) : null}
        <span
          className="transition-transform duration-150 ease-out motion-reduce:transition-none"
          style={{ transform: `translateY(${lifted ? -14 : 0}px)` }}
          aria-hidden
        >
          <svg width="44" height="54" viewBox="0 0 44 54">
            <path d="M22 2C11 2 3 10 3 21c0 13 19 31 19 31s19-18 19-31C41 10 33 2 22 2z" fill="var(--sam-primary)" />
            <circle cx="22" cy="21" r="7" fill="var(--sam-surface, #fff)" />
          </svg>
        </span>
      </div>
      {/** 핀 끝이 닿는 지점 = 지도 가운데 — 그림자는 그 자리에 고정 */}
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 h-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/30 transition-all duration-150 motion-reduce:transition-none"
        style={{ width: lifted ? 10 : 16, opacity: lifted ? 0.55 : 1 }}
        aria-hidden
      />
    </div>
  );
}
