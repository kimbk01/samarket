"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressEditorLocationSearch } from "@/components/addresses/AddressEditorLocationSearch";
import { fetchPlacePredictionsPh, type PlacePredictionRow } from "@/lib/map/fetch-place-predictions-ph";
import { resolveCanonicalAddressFromPlaceId } from "@/lib/addresses/canonical-address-resolver";
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";
import {
  displayInputFromDraft,
  resolveCanonicalDisplayLines,
} from "@/lib/addresses/canonical-address-display";

type AddressSearchProps = {
  onPlaceResolved: (draft: CanonicalAddressDraft) => void;
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
      const draft = await resolveCanonicalAddressFromPlaceId(row.placeId);
      if (!draft) return;
      const lines = resolveCanonicalDisplayLines(displayInputFromDraft(draft));
      const formatted = [lines.title, lines.addressLine].filter(Boolean).join(", ") || draft.formattedAddress || row.description;
      setSearch(row.description || formatted);
      setPredictions([]);
      cbRef.current(draft);
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
