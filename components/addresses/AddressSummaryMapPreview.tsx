"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";

/** WGS84 → OSM slippy map 타일 (키 없이 미리보기용) */
function osmTileUrl(lat: number, lng: number, z: number): string {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** z;
  const xTile = Math.floor(((lng + 180) / 360) * n);
  const yTile = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return `https://tile.openstreetmap.org/${z}/${xTile}/${yTile}.png`;
}

type Props = {
  lat: number;
  lng: number;
  sizePx?: number;
  className?: string;
};

/**
 * 주소 요약용 작은 지도 — Static Maps API 없이 **Maps JS** 로 렌더(브라우저 키와 동일).
 * 실패·키 없음 시 OSM 타일 1장으로 폴백.
 */
export function AddressSummaryMapPreview({ lat, lng, sizePx = 72, className = "" }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const posRef = useRef({ lat, lng });
  posRef.current = { lat, lng };
  const hasKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());
  const [mode, setMode] = useState<"google" | "osm">(hasKey ? "google" : "osm");

  useEffect(() => {
    if (mode !== "google" || !elRef.current) return;
    let cancelled = false;

    void (async () => {
      try {
        await loadGoogleMaps();
        if (cancelled || !elRef.current || mapRef.current) return;

        const center = posRef.current;
        const map = new google.maps.Map(elRef.current, {
          center,
          zoom: 17,
          disableDefaultUI: true,
          gestureHandling: "none",
          draggable: false,
          keyboardShortcuts: false,
          clickableIcons: false,
          mapTypeControl: false,
          fullscreenControl: false,
          zoomControl: false,
          scrollwheel: false,
        });
        mapRef.current = map;
        markerRef.current = new google.maps.Marker({
          position: center,
          map,
        });
      } catch {
        if (!cancelled) setMode("osm");
      }
    })();

    return () => {
      cancelled = true;
      const m = mapRef.current;
      if (m) {
        google.maps.event.clearInstanceListeners(m);
        mapRef.current = null;
      }
      markerRef.current?.setMap(null);
      markerRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "google" || !mapRef.current) return;
    const c = { lat, lng };
    mapRef.current.setCenter(c);
    markerRef.current?.setPosition(c);
  }, [lat, lng, mode]);

  if (mode === "osm") {
    const src = osmTileUrl(lat, lng, 17);
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 외부 타일 URL
      <img
        src={src}
        alt=""
        width={sizePx}
        height={sizePx}
        className={`shrink-0 rounded-ui-rect object-cover bg-sam-surface-muted ${className}`}
        style={{ width: sizePx, height: sizePx }}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      ref={elRef}
      className={`shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted ${className}`}
      style={{ width: sizePx, height: sizePx, minWidth: sizePx, minHeight: sizePx }}
      aria-hidden
    />
  );
}
