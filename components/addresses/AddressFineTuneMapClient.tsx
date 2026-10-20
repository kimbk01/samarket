"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { addressMapPinMarkerIcon } from "@/lib/addresses/address-map-pin-chrome";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";

/**
 * 핀 드래그로 좌표를 바꾼 뒤, 부모에서 역지오코딩·반영 여부를 처리한다.
 */
export function AddressFineTuneMapClient(props: {
  latitude: number;
  longitude: number;
  onPositionChange: (lat: number, lng: number) => void;
  heightPx?: number;
}) {
  const { latitude, longitude, onPositionChange, heightPx = 220 } = props;
  const { t } = useI18n();
  /** 지도 스크립트 로드 실패 — 지도 영역 안에서 오류 + 재시도 (MAP-001) */
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;

  useEffect(() => {
    let cancelled = false;
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
        /** 팝업 안에서도 확대·이동·전체 화면으로 미세 조정 가능 */
        fullscreenControl: true,
        zoomControl: true,
        gestureHandling: "greedy",
        scrollwheel: true,
        keyboardShortcuts: false,
        clickableIcons: false,
      });
      const marker = new google.maps.Marker({
        position: { lat: latitude, lng: longitude },
        map,
        draggable: true,
        icon: addressMapPinMarkerIcon(google.maps),
      });
      markerRef.current = marker;
      mapRef.current = map;
      marker.addListener("dragend", () => {
        const p = marker.getPosition();
        if (p) onPositionChangeRef.current(p.lat(), p.lng());
      });
    })();
    return () => {
      cancelled = true;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트(또는 재시도) 시 한 번만 지도 생성; 좌표 동기는 아래 effect
  }, [loadAttempt]);

  useEffect(() => {
    const m = markerRef.current;
    const map = mapRef.current;
    if (m) m.setPosition({ lat: latitude, lng: longitude });
    if (map) map.panTo({ lat: latitude, lng: longitude });
  }, [latitude, longitude]);

  if (loadFailed) {
    return (
      <div
        className="flex w-full flex-col items-center justify-center gap-3 bg-sam-surface-muted px-4 text-center"
        style={{ height: heightPx }}
        role="alert"
        data-testid="address-fine-tune-map-error"
      >
        <p className="sam-text-body-secondary font-medium text-sam-muted">{t("addr_ui_maps_load_failed")}</p>
        <button
          type="button"
          onClick={() => {
            setLoadFailed(false);
            setLoadAttempt((n) => n + 1);
          }}
          className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing}`}
        >
          {t("common_retry")}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden bg-sam-surface-muted"
      style={{ height: heightPx }}
      role="presentation"
    />
  );
}
