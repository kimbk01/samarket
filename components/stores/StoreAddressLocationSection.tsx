"use client";

import { LocationSelector } from "@/components/write/shared/LocationSelector";
import { StoreAddressStreetDetailGrid } from "@/components/stores/StoreAddressStreetDetailGrid";
import {
  OWNER_STORE_FORM_HINT_CLASS,
  OWNER_STORE_FORM_LEAD_CLASS,
} from "@/lib/business/owner-store-stack";

export type StoreAddressLocationSectionProps = {
  /** 기본: 「위치」 */
  sectionTitle?: string;
  /** 지역·동네 블록 바로 아래 안내 문구 */
  sectionHint: string;
  regionId: string;
  cityId: string;
  onRegionChange: (regionId: string) => void;
  onCityChange: (cityId: string) => void;
  addressStreetLine: string;
  addressDetail: string;
  onAddressStreetLineChange: (value: string) => void;
  onAddressDetailChange: (value: string) => void;
  showZipLookup?: boolean;
  philippinesZipSeed?: string;
  onPhilippinesZipCommitted?: (fourDigitZip: string) => void;
  locationLabel?: string;
  showRequired?: boolean;
};

/**
 * 매장 신청·기본 정보·모의 편집 등 동일 UI:
 * 위치(안내) → 지역·동네(+ PhilPost ZIP) → 지번·건물·번지 | 동·호·출입 (한 행)
 */
export function StoreAddressLocationSection({
  sectionTitle = "위치",
  sectionHint,
  regionId,
  cityId,
  onRegionChange,
  onCityChange,
  addressStreetLine,
  addressDetail,
  onAddressStreetLineChange,
  onAddressDetailChange,
  showZipLookup = true,
  philippinesZipSeed,
  onPhilippinesZipCommitted,
  locationLabel = "지역 · 동네",
  showRequired = false,
}: StoreAddressLocationSectionProps) {
  return (
    <>
      <div>
        <p className={OWNER_STORE_FORM_LEAD_CLASS}>{sectionTitle}</p>
        <p className={OWNER_STORE_FORM_HINT_CLASS}>{sectionHint}</p>
        <LocationSelector
          embedded
          region={regionId}
          city={cityId}
          onRegionChange={onRegionChange}
          onCityChange={onCityChange}
          label={locationLabel}
          showRequired={showRequired}
          showZipLookup={showZipLookup}
          philippinesZipSeed={philippinesZipSeed}
          onPhilippinesZipCommitted={onPhilippinesZipCommitted}
        />
      </div>
      <StoreAddressStreetDetailGrid
        addressStreetLine={addressStreetLine}
        addressDetail={addressDetail}
        onAddressStreetLineChange={onAddressStreetLineChange}
        onAddressDetailChange={onAddressDetailChange}
      />
    </>
  );
}
