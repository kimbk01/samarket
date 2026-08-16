"use client";

import { useEffect, useRef } from "react";
import {
  ADDRESS_MAP_GOOGLE_PIN_ELEMENT,
  ADDRESS_MAP_PIN_TEXT_CLASS,
} from "@/lib/addresses/address-map-pin-chrome";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";

export const MAP_PICKER_DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };

type LatLng = { lat: number; lng: number };

export type MapPickerMode = "marker" | "center";

type MapPickerProps = {
  marker: LatLng;
  onMarkerPositionChange: (pos: LatLng) => void;
  /** POI(상호) 클릭 시 place_id + 좌표 전달 — 거래 희망 장소에서 상호명 직접 획득용 */
  onPoiClick?: (info: { placeId: string; lat: number; lng: number }) => void;
  /** `center`: 지도 중앙 고정 핀 — 지도를 드래그해 위치 지정 (참고 UI) */
  mode?: MapPickerMode;
  /** `true`면 지도 드래그·줌을 막고, idle 로 좌표를 올리지 않음(상세 입력 단계 등) */
  interactionLocked?: boolean;
  /**
   * Optional browse-radius circle (meters = km * 1000).
   * Visual only — not navigation precision.
   */
  radiusKm?: number | null;
  className?: string;
};

function nearlyEqual(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
}

/** GCP 맵 스타일용(선택). 없으면 고급 마커 테스트용 DEMO_MAP_ID 사용 */
function mapPickerMapId(): string {
  const env = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim();
  return env || "DEMO_MAP_ID";
}

type MarkerHandle =
  | { kind: "advanced"; el: google.maps.marker.AdvancedMarkerElement }
  | { kind: "legacy"; el: google.maps.Marker };

function readLatLng(p: google.maps.LatLng | google.maps.LatLngLiteral): LatLng {
  if (typeof (p as google.maps.LatLng).lat === "function") {
    const ll = p as google.maps.LatLng;
    return { lat: ll.lat(), lng: ll.lng() };
  }
  const lit = p as google.maps.LatLngLiteral;
  return { lat: lit.lat, lng: lit.lng };
}

/**
 * Google Maps — marker: 클릭·핀 드래그 / center: 중앙 고정 + 지도 이동
 * (`AdvancedMarkerElement` 우선, 지도가 고급 마커 미지원이면 레거시 Marker 폴백)
 */
export function MapPicker({
  marker,
  onMarkerPositionChange,
  onPoiClick,
  mode = "marker",
  interactionLocked = false,
  radiusKm = null,
  className,
}: MapPickerProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerHandleRef = useRef<MarkerHandle | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const onMoveRef = useRef(onMarkerPositionChange);
  const onPoiRef = useRef(onPoiClick);
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const suppressIdleRef = useRef(false);
  const lockRef = useRef(interactionLocked);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const dragListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const capsListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  /** 비동기 고급 마커 마운트 완료 시점에 최신 좌표를 쓰기 위함 */
  const markerRefForMount = useRef(marker);
  markerRefForMount.current = marker;

  useEffect(() => {
    onMoveRef.current = onMarkerPositionChange;
  }, [onMarkerPositionChange]);

  useEffect(() => {
    onPoiRef.current = onPoiClick;
  }, [onPoiClick]);

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

    const detachMarker = () => {
      if (dragListenerRef.current && google.maps?.event) {
        google.maps.event.removeListener(dragListenerRef.current);
        dragListenerRef.current = null;
      }
      const h = markerHandleRef.current;
      markerHandleRef.current = null;
      if (!h) return;
      if (h.kind === "advanced") {
        h.el.map = null;
      } else {
        h.el.setMap(null);
      }
    };

    const attachMapClick = (map: google.maps.Map) => {
      if (mapClickListenerRef.current) {
        google.maps.event.removeListener(mapClickListenerRef.current);
        mapClickListenerRef.current = null;
      }
      mapClickListenerRef.current = map.addListener("click", (e: google.maps.MapMouseEvent) => {
        const ll = e.latLng;
        if (!ll) return;
        const ev = e as google.maps.MapMouseEvent & { placeId?: string };
        if (ev.placeId && onPoiRef.current) {
          onPoiRef.current({ placeId: ev.placeId, lat: ll.lat(), lng: ll.lng() });
          return;
        }
        onMoveRef.current({ lat: ll.lat(), lng: ll.lng() });
      });
    };

    const mountLegacyMarker = (map: google.maps.Map, pos: LatLng) => {
      detachMarker();
      const mk = new google.maps.Marker({
        position: pos,
        map,
        draggable: true,
      });
      markerHandleRef.current = { kind: "legacy", el: mk };
      dragListenerRef.current = mk.addListener("dragend", () => {
        const p = mk.getPosition();
        if (!p) return;
        onMoveRef.current({ lat: p.lat(), lng: p.lng() });
      });
    };

    const mountAdvancedMarker = async (map: google.maps.Map, pos: LatLng) => {
      const lib = (await google.maps.importLibrary("marker")) as google.maps.MarkerLibrary;
      if (cancelled || !mapRef.current || mapRef.current !== map) return;
      const { AdvancedMarkerElement, PinElement } = lib;
      detachMarker();
      const pin = new PinElement({ ...ADDRESS_MAP_GOOGLE_PIN_ELEMENT });
      const adv = new AdvancedMarkerElement({
        map,
        position: pos,
        content: pin.element,
        gmpDraggable: true,
        title: "선택 위치",
      });
      markerHandleRef.current = { kind: "advanced", el: adv };
      dragListenerRef.current = adv.addListener("dragend", () => {
        const p = adv.position;
        if (!p) return;
        onMoveRef.current(readLatLng(p));
      });
    };

    let markerMountInFlight = false;
    const tryMountMarker = (map: google.maps.Map, pos: LatLng) => {
      if (cancelled || markerHandleRef.current || mode !== "marker") return;
      let caps: google.maps.MapCapabilities | null = null;
      try {
        caps = map.getMapCapabilities();
      } catch {
        caps = null;
      }
      if (caps?.isAdvancedMarkersAvailable === false) {
        mountLegacyMarker(map, pos);
        return;
      }
      if (markerMountInFlight) return;
      markerMountInFlight = true;
      void mountAdvancedMarker(map, pos).finally(() => {
        markerMountInFlight = false;
      });
    };

    void (async () => {
      try {
        await loadGoogleMaps();
      } catch {
        return;
      }
      if (cancelled || !elRef.current) return;

      const centerNow = markerRefForMount.current;
      const map = new google.maps.Map(elRef.current, {
        center: centerNow,
        zoom: 17,
        mapId: mapPickerMapId(),
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      mapRef.current = map;

      if (mode === "marker") {
        attachMapClick(map);
        const scheduleTry = () => tryMountMarker(map, markerRefForMount.current);
        capsListenerRef.current = map.addListener("mapcapabilities_changed", scheduleTry);
        google.maps.event.addListenerOnce(map, "idle", scheduleTry);
        scheduleTry();
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
      if (capsListenerRef.current && google.maps?.event) {
        google.maps.event.removeListener(capsListenerRef.current);
        capsListenerRef.current = null;
      }
      if (mapClickListenerRef.current && google.maps?.event) {
        google.maps.event.removeListener(mapClickListenerRef.current);
        mapClickListenerRef.current = null;
      }
      if (idleListenerRef.current && google.maps?.event) {
        google.maps.event.removeListener(idleListenerRef.current);
        idleListenerRef.current = null;
      }
      detachMarker();
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 맵 인스턴스는 1회만 생성
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || typeof google === "undefined" || !google.maps) return;
    const km =
      typeof radiusKm === "number" && Number.isFinite(radiusKm) && radiusKm > 0
        ? radiusKm
        : null;
    if (km == null) {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
      return;
    }
    const radiusMeters = km * 1000;
    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({
        map,
        center: marker,
        radius: radiusMeters,
        strokeColor: "#7C3AED",
        strokeOpacity: 0.85,
        strokeWeight: 2,
        fillColor: "#7C3AED",
        fillOpacity: 0.12,
        clickable: false,
      });
    } else {
      circleRef.current.setCenter(marker);
      circleRef.current.setRadius(radiusMeters);
      if (!circleRef.current.getMap()) circleRef.current.setMap(map);
    }
    const bounds = circleRef.current.getBounds();
    if (bounds) {
      suppressIdleRef.current = true;
      map.fitBounds(bounds, 24);
      window.requestAnimationFrame(() => {
        suppressIdleRef.current = false;
      });
    }
  }, [radiusKm, marker.lat, marker.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (mode === "marker") {
      const h = markerHandleRef.current;
      if (!h) return;
      if (h.kind === "advanced") {
        h.el.position = marker;
      } else {
        h.el.setPosition(marker);
      }
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
            <span className="mb-0.5 rounded-full bg-ui-fg px-2.5 py-1 sam-text-helper font-medium text-white shadow-md">
              여기로 선택
            </span>
            <svg width="40" height="48" viewBox="0 0 40 48" className={`${ADDRESS_MAP_PIN_TEXT_CLASS} drop-shadow-md`} aria-hidden>
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
