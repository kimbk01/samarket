"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressEditorLocationSearch } from "@/components/addresses/AddressEditorLocationSearch";
import { fetchPlacePredictionsPh, type PlacePredictionRow } from "@/lib/map/fetch-place-predictions-ph";
import { PLACE_FIELDS_POI_FULL } from "@/lib/map/places-new-api";
import { fetchPlaceDetailsAsLegacyPlaceResultCached } from "@/lib/addresses/google-place-details-client-cache";

type AddressSearchProps = {
  onPlaceResolved: (lat: number, lng: number, formattedAddress: string, placeId: string | null) => void;
  placeholder?: string;
  className?: string;
};

/**
 * Member map-select search — SAME pipeline as AddressEditorLocationSearch:
 * AutocompleteService → Place Details (not Autocomplete Widget).
 */
export function AddressSearch({ onPlaceResolved, className }: AddressSearchProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [predictions, setPredictions] = useState<PlacePredictionRow[]>([]);
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const cbRef = useRef(onPlaceResolved);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cbRef.current = onPlaceResolved;
  }, [onPlaceResolved]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = search.trim();
    if (q.length < 2) {
      setPredictions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const rows = await fetchPlacePredictionsPh(q);
          setPredictions(rows);
        } catch {
          setPredictions([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const onSelectPrediction = useCallback(async (row: PlacePredictionRow) => {
    if (!row.placeId.trim()) return;
    setResolvingPlaceId(row.placeId);
    try {
      const detail = await fetchPlaceDetailsAsLegacyPlaceResultCached(row.placeId, PLACE_FIELDS_POI_FULL);
      const loc = detail?.geometry?.location;
      const lat = typeof loc?.lat === "function" ? loc.lat() : null;
      const lng = typeof loc?.lng === "function" ? loc.lng() : null;
      const formatted = (detail?.formatted_address ?? row.description ?? "").trim();
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || !formatted) {
        return;
      }
      setSearch(row.description || formatted);
      setPredictions([]);
      cbRef.current(lat, lng, formatted, row.placeId);
    } finally {
      setResolvingPlaceId(null);
    }
  }, []);

  return (
    <div className={className}>
      <AddressEditorLocationSearch
        search={search}
        searching={searching}
        predictions={predictions}
        resolvingPlaceId={resolvingPlaceId}
        onSearchChange={setSearch}
        onSearchFocus={() => undefined}
        onSelectPrediction={(row) => void onSelectPrediction(row)}
      />
      {resolvingPlaceId ? (
        <p className="mt-1 sam-text-helper text-sam-muted">{t("addr_ui_searching")}</p>
      ) : null}
    </div>
  );
}
