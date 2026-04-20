"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/map/load-google-maps";
import { ADDR_SEARCH_INPUT, ADDR_SEARCH_WRAP } from "@/lib/ui/address-flow-viber";

type AddressSearchProps = {
  onPlaceResolved: (lat: number, lng: number, formattedAddress: string) => void;
  placeholder?: string;
  className?: string;
};

/**
 * Google Places Autocomplete — 필리핀(`componentRestrictions`) 우선.
 */
export function AddressSearch({
  onPlaceResolved,
  placeholder = "지번, 건물명, 호텔명으로 검색",
  className,
}: AddressSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  const cbRef = useRef(onPlaceResolved);

  useEffect(() => {
    cbRef.current = onPlaceResolved;
  }, [onPlaceResolved]);

  useEffect(() => {
    let cancelled = false;
    let listener: google.maps.MapsEventListener | null = null;

    void (async () => {
      try {
        await loadGoogleMaps();
      } catch {
        return;
      }
      if (cancelled || !inputRef.current) return;
      const ac = new google.maps.places.Autocomplete(inputRef.current, {
        fields: ["geometry", "formatted_address", "name"],
        componentRestrictions: { country: "ph" },
      });
      acRef.current = ac;
      listener = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (!loc) return;
        const addr = (place.formatted_address ?? place.name ?? "").trim();
        cbRef.current(loc.lat(), loc.lng(), addr);
      });
    })();

    return () => {
      cancelled = true;
      if (listener && typeof google !== "undefined" && google.maps?.event) {
        google.maps.event.removeListener(listener);
      }
      acRef.current = null;
    };
  }, []);

  return (
    <div className={className}>
      <div className={ADDR_SEARCH_WRAP}>
        <svg className="h-5 w-5 shrink-0 text-signature/70" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm9.2 2-4.2-4.2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={placeholder}
          className={ADDR_SEARCH_INPUT}
        />
      </div>
    </div>
  );
}
