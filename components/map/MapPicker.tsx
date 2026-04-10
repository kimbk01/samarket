"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";

export const MAP_PICKER_DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };

type LatLng = { lat: number; lng: number };

export type MapPickerMode = "marker" | "center";

type MapPickerProps = {
  marker: LatLng;
  onMarkerPositionChange: (pos: LatLng) => void;
  /** `center`: 지도 중앙 고정 핀 — 지도를 드래그해 위치 지정 (참고 UI) */
  mode?: MapPickerMode;
  /** `true`면 지도 드래그·줌을 막고, idle 로 좌표를 올리지 않음(상세 입력 단계 등) */
  interactionLocked?: boolean;
  className?: string;
};

function nearlyEqual(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
}

/**
 * Google Maps — marker: 클릭·핀 드래그 / center: 중앙 고정 + 지도 이동
 */
export function MapPicker({
  marker,
  onMarkerPositionChange,
  mode = "marker",
  interactionLocked = false,
  className,
}: MapPickerProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const mkRef = useRef<google.maps.Marker | null>(null);
  const onMoveRef = useRef(onMarkerPositionChange);
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const suppressIdleRef = useRef(false);
  const lockRef = useRef(interactionLocked);

  useEffect(() => {
    onMoveRef.current = onMarkerPositionChange;
  }, [onMarkerPositionChange]);

  useEffect(() => {
    lockRef.current = interactionLocked;
    const map = mapRef.current;
    if (!map) return;
    map.setOptions({
      draggable: !interactionLocked,
      scrollwheel: !interactionLocked,
      disableDoubleClickZoom: interactionLocked,
      gestureHandling: interactionLocked ? "none" : "auto",
    });
  }, [interactionLocked]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadGoogleMaps();
      } catch {
        return;
      }
      if (cancelled || !elRef.current) return;
      const map = new google.maps.Map(elRef.current, {
        center: marker,
        zoom: 17,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      mapRef.current = map;

      if (mode === "marker") {
        const mk = new google.maps.Marker({
          position: marker,
          map,
          draggable: true,
        });
        mkRef.current = mk;
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          const ll = e.latLng;
          if (!ll) return;
          onMoveRef.current({ lat: ll.lat(), lng: ll.lng() });
        });
        mk.addListener("dragend", () => {
          const p = mk.getPosition();
          if (!p) return;
          onMoveRef.current({ lat: p.lat(), lng: p.lng() });
        });
      } else {
        idleListenerRef.current = map.addListener("idle", () => {
          if (suppressIdleRef.current || lockRef.current) return;
          const c = map.getCenter();
          if (!c) return;
          onMoveRef.current({ lat: c.lat(), lng: c.lng() });
        });
      }
    })();
    return () => {
      cancelled = true;
      if (idleListenerRef.current && typeof google !== "undefined" && google.maps?.event) {
        google.maps.event.removeListener(idleListenerRef.current);
        idleListenerRef.current = null;
      }
      mkRef.current = null;
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 맵 인스턴스는 1회만 생성
  }, [mode]);

  useEffect(() => {
    const mk = mkRef.current;
    const map = mapRef.current;
    if (!map) return;

    if (mode === "marker") {
      if (!mk) return;
      mk.setPosition(marker);
      map.panTo(marker);
      return;
    }

    const c = map.getCenter();
    if (c && nearlyEqual({ lat: c.lat(), lng: c.lng() }, marker)) return;
    suppressIdleRef.current = true;
    map.panTo(marker);
    window.requestAnimationFrame(() => {
      suppressIdleRef.current = false;
    });
  }, [marker, mode]);

  if (mode === "center") {
    return (
      <div className={`relative ${className ?? "h-full min-h-0 w-full"}`}>
        <div ref={elRef} className="absolute inset-0 h-full w-full" />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full"
          aria-hidden
        >
          <div className="relative flex flex-col items-center">
            <span className="mb-0.5 rounded-full bg-ui-fg px-2.5 py-1 text-[12px] font-medium text-white shadow-md">
              여기로 선택
            </span>
            <svg width="40" height="48" viewBox="0 0 40 48" className="text-signature drop-shadow-md" aria-hidden>
              <path
                d="M20 0C12.3 0 6 6.1 6 13.6c0 10.2 14 22.9 14 22.9s14-12.7 14-22.9C34 6.1 27.7 0 20 0z"
                fill="currentColor"
              />
              <circle cx="20" cy="14" r="5" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return <div ref={elRef} className={className ?? "h-full min-h-0 w-full"} />;
}
