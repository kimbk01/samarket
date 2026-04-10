"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";

export const MAP_PICKER_DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };

type LatLng = { lat: number; lng: number };

type MapPickerProps = {
  marker: LatLng;
  onMarkerPositionChange: (pos: LatLng) => void;
  className?: string;
};

/**
 * Google Maps — 클릭·핀 드래그 시 좌표만 상위로 전달 (역지오코딩은 상위).
 */
export function MapPicker({ marker, onMarkerPositionChange, className }: MapPickerProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const mkRef = useRef<google.maps.Marker | null>(null);
  const onMoveRef = useRef(onMarkerPositionChange);

  useEffect(() => {
    onMoveRef.current = onMarkerPositionChange;
  }, [onMarkerPositionChange]);

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
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 맵 인스턴스는 1회만 생성
  }, []);

  useEffect(() => {
    const mk = mkRef.current;
    const map = mapRef.current;
    if (!mk || !map) return;
    mk.setPosition(marker);
    map.panTo(marker);
  }, [marker]);

  return <div ref={elRef} className={className ?? "h-full min-h-0 w-full"} />;
}
