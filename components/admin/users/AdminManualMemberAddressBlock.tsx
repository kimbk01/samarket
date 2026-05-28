"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressEditorLocationSearch } from "@/components/addresses/AddressEditorLocationSearch";
import { AddressSummaryMapPreview } from "@/components/addresses/AddressSummaryMapPreview";
import { fetchPlacePredictionsPh, type PlacePredictionRow } from "@/lib/map/fetch-place-predictions-ph";
import { PLACE_FIELDS_POI_FULL } from "@/lib/map/places-new-api";
import { fetchPlaceDetailsAsLegacyPlaceResultCached } from "@/lib/addresses/google-place-details-client-cache";
import { parsePhFromGooglePlaceResult } from "@/lib/addresses/ph-google-place-address-components";
import { formatPhDeliveryStreetSummary } from "@/lib/addresses/ph-address-display";
import { stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  emptyAdminCreateMemberAddress,
  type AdminCreateMemberAddressInput,
} from "@/lib/admin-users/admin-create-member-address";
import type { AdminCreateMemberFormField } from "@/lib/admin-users/admin-create-member-fields";
import type { MessageKey } from "@/lib/i18n/messages";

const fieldLabelClass = "mb-1 block sam-text-body-secondary font-medium text-sam-fg";
const fieldInputClass =
  "w-full rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body focus-visible:border-signature focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signature/20";
const fieldErrorClass = "mt-1.5 sam-text-helper font-medium text-sam-danger";

export function AdminManualMemberAddressBlock(props: {
  value: AdminCreateMemberAddressInput;
  onChange: (next: AdminCreateMemberAddressInput) => void;
  fieldErrors: Partial<Record<AdminCreateMemberFormField, MessageKey>>;
  attempted: boolean;
  onFieldTouch: (field: AdminCreateMemberFormField) => void;
}) {
  const { t } = useI18n();
  const { value, onChange, fieldErrors, attempted, onFieldTouch } = props;

  const [search, setSearch] = useState("");
  const [predictions, setPredictions] = useState<PlacePredictionRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const selectionAnchorSearchRef = useRef<string | null>(null);

  const showDetailSection =
    value.latitude != null && value.longitude != null && Boolean(value.placeId.trim());

  const streetPreview = useMemo(() => {
    const dto = {
      countryCode: "PH",
      countryName: "Philippines",
      roadAddress: value.roadAddress || null,
      formattedAddress: value.formattedAddress || null,
      fullAddress: value.fullAddress || null,
    } as UserAddressDTO;
    return formatPhDeliveryStreetSummary(dto);
  }, [value.roadAddress, value.formattedAddress, value.fullAddress]);

  const detailViol =
    attempted && showDetailSection && !value.unitFloorRoom.trim();
  const searchErrKey = fieldErrors.addressSearch;
  const detailErrKey = fieldErrors.addressDetail;

  const patch = useCallback(
    (partial: Partial<AdminCreateMemberAddressInput>) => {
      onChange({ ...value, ...partial });
    },
    [onChange, value]
  );

  const clearGeo = useCallback(() => {
    onChange(emptyAdminCreateMemberAddress());
    setSearch("");
    setPredictions([]);
    selectionAnchorSearchRef.current = null;
  }, [onChange]);

  const handleSearchFocus = useCallback(() => {
    if (!search.trim()) return;
    onFieldTouch("addressSearch");
    selectionAnchorSearchRef.current = null;
    setSearch("");
    setPredictions([]);
    setSearching(false);
    clearGeo();
  }, [clearGeo, onFieldTouch, search]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      selectionAnchorSearchRef.current = null;
      setPredictions([]);
      setSearching(false);
      return;
    }
    if (
      value.latitude != null &&
      value.longitude != null &&
      selectionAnchorSearchRef.current != null &&
      q === selectionAnchorSearchRef.current
    ) {
      setPredictions([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await fetchPlacePredictionsPh(q);
          if (!cancelled) setPredictions(rows);
        } catch {
          if (!cancelled) setPredictions([]);
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, value.latitude, value.longitude]);

  async function selectPrediction(row: PlacePredictionRow) {
    if (!row.placeId.trim()) return;
    onFieldTouch("addressSearch");
    setResolvingPlaceId(row.placeId);
    try {
      const detail = await fetchPlaceDetailsAsLegacyPlaceResultCached(row.placeId, PLACE_FIELDS_POI_FULL);
      const loc = detail?.geometry?.location;
      const lat = typeof loc?.lat === "function" ? loc.lat() : null;
      const lng = typeof loc?.lng === "function" ? loc.lng() : null;
      const formatted = (detail?.formatted_address ?? row.description ?? "").trim();
      if (!formatted || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        onChange({
          ...emptyAdminCreateMemberAddress(),
          placeId: row.placeId,
        });
        return;
      }
      const ph = parsePhFromGooglePlaceResult(detail);
      const label = (row.description || formatted).trim();
      selectionAnchorSearchRef.current = label.length >= 2 ? label : null;
      onChange({
        placeId: row.placeId,
        latitude: lat,
        longitude: lng,
        formattedAddress: formatted,
        roadAddress: row.description || formatted,
        fullAddress: formatted,
        streetAddress: ph.routeLine || row.mainText || formatted,
        barangay: ph.barangay ?? "",
        cityMunicipality: ph.cityMunicipality ?? "",
        province: ph.province ?? "",
        neighborhoodName: ph.neighborhood ?? "",
        buildingName: ph.buildingOrPlaceHeadline ?? "",
        unitFloorRoom: "",
        deliveryNote: value.deliveryNote,
      });
      setPredictions([]);
      setSearch(label);
      window.setTimeout(() => {
        document.getElementById("admin-create-member-addr-detail")?.focus();
      }, 0);
    } finally {
      setResolvingPlaceId(null);
    }
  }

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-app/80 p-3 space-y-3">
      <div>
        <p className={fieldLabelClass}>{t("admin_users_label_address_optional")}</p>
        <p className="sam-text-helper leading-relaxed text-sam-muted">{t("admin_users_addr_section_hint")}</p>
      </div>

      <AddressEditorLocationSearch
        search={search}
        searching={searching}
        predictions={predictions}
        resolvingPlaceId={resolvingPlaceId}
        onSearchChange={(next) => {
          setSearch(next);
          onFieldTouch("addressSearch");
        }}
        onSearchFocus={handleSearchFocus}
        onSelectPrediction={(p) => void selectPrediction(p)}
      />
      {searchErrKey ? (
        <p className={fieldErrorClass} role="alert">
          {t(searchErrKey)}
        </p>
      ) : null}

      {showDetailSection ? (
        <div className="space-y-3 border-t border-sam-border/70 pt-3">
          <div>
            <span className={fieldLabelClass}>{t("addr_ui_place_summary")}</span>
            <div className="mt-1.5 flex gap-3 rounded-lg border border-sam-border bg-sam-surface px-3 py-2.5">
              <AddressSummaryMapPreview lat={value.latitude!} lng={value.longitude!} sizePx={72} />
              <div className="min-w-0 flex-1 space-y-1">
                {value.buildingName.trim() ? (
                  <p className="sam-text-body font-semibold leading-snug text-sam-fg">{value.buildingName.trim()}</p>
                ) : null}
                <p className="sam-text-body-secondary leading-relaxed text-sam-fg">
                  {streetPreview ||
                    stripCountryFromAddressDisplayLine(
                      (value.formattedAddress || value.fullAddress).trim(),
                      "Philippines"
                    ) ||
                    `${value.latitude!.toFixed(5)}, ${value.longitude!.toFixed(5)}`}
                </p>
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="admin-create-member-addr-detail" className={fieldLabelClass}>
              {t("addr_ui_detail_required_label")}
            </label>
            <input
              id="admin-create-member-addr-detail"
              value={value.unitFloorRoom}
              onChange={(e) => {
                onFieldTouch("addressDetail");
                patch({ unitFloorRoom: e.target.value });
              }}
              placeholder={t("addr_ui_detail_ph")}
              autoComplete="address-line2"
              aria-invalid={detailViol || Boolean(detailErrKey)}
              className={`${fieldInputClass} ${detailViol || detailErrKey ? "border-sam-danger focus-visible:border-sam-danger focus-visible:ring-sam-danger/25" : ""}`}
            />
            {detailErrKey || detailViol ? (
              <p className={fieldErrorClass} role="alert">
                {t(detailErrKey ?? "addr_ui_detail_required_err")}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="admin-create-member-addr-note" className={fieldLabelClass}>
              {t("addr_ui_delivery_note")}{" "}
              <span className="font-normal text-sam-meta">{t("admin_users_optional_paren")}</span>
            </label>
            <input
              id="admin-create-member-addr-note"
              value={value.deliveryNote}
              onChange={(e) => patch({ deliveryNote: e.target.value })}
              placeholder={t("addr_ui_delivery_ph")}
              autoComplete="off"
              className={fieldInputClass}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
