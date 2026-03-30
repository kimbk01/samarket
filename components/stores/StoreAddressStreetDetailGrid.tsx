"use client";

import {
  STORE_ADDRESS_DETAIL_LABEL,
  STORE_ADDRESS_DETAIL_MAX,
  STORE_ADDRESS_STREET_HINT,
  STORE_ADDRESS_STREET_LABEL,
  STORE_ADDRESS_STREET_MAX,
  STORE_ADDRESS_STREET_PLACEHOLDER,
} from "@/lib/stores/store-address-form-ui";
import {
  OWNER_STORE_CONTROL_CLASS,
  OWNER_STORE_FIELD_LABEL_CLASS,
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_FORM_HINT_CLASS,
} from "@/lib/business/owner-store-stack";

export type StoreAddressStreetDetailGridProps = {
  addressStreetLine: string;
  addressDetail: string;
  onAddressStreetLineChange: (value: string) => void;
  onAddressDetailChange: (value: string) => void;
  /** 입력칸 클래스 (주소 시트 등은 `rounded-lg border ... text-[14px]` 로 통일) */
  inputClassName?: string;
  showStreetHint?: boolean;
};

/**
 * 지번·건물·번지 | 동·호·출입 등 — 매장/프로필/주소록 공통 2열 행
 */
export function StoreAddressStreetDetailGrid({
  addressStreetLine,
  addressDetail,
  onAddressStreetLineChange,
  onAddressDetailChange,
  inputClassName = OWNER_STORE_CONTROL_CLASS,
  showStreetHint = true,
}: StoreAddressStreetDetailGridProps) {
  return (
    <div className="space-y-2">
      {showStreetHint ? (
        <p className={OWNER_STORE_FORM_HINT_CLASS}>{STORE_ADDRESS_STREET_HINT}</p>
      ) : null}
      <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
        <div className="min-w-0">
          <label className={OWNER_STORE_FIELD_LABEL_CLASS}>
            {STORE_ADDRESS_STREET_LABEL}
          </label>
          <input
            type="text"
            autoComplete="street-address"
            maxLength={STORE_ADDRESS_STREET_MAX}
            value={addressStreetLine}
            onChange={(e) => onAddressStreetLineChange(e.target.value)}
            className={inputClassName}
            placeholder={STORE_ADDRESS_STREET_PLACEHOLDER}
          />
        </div>
        <div className="min-w-0">
          <label className={OWNER_STORE_FIELD_LABEL_CLASS}>
            {STORE_ADDRESS_DETAIL_LABEL}
          </label>
          <input
            type="text"
            autoComplete="address-line2"
            maxLength={STORE_ADDRESS_DETAIL_MAX}
            value={addressDetail}
            onChange={(e) => onAddressDetailChange(e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>
    </div>
  );
}
