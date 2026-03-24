"use client";

import { useCallback, useState } from "react";
import { REGIONS } from "@/lib/products/form-options";
import { lookupLocationByPhilippinesZip, normalizePhilippinesZipInput } from "@/lib/products/zip-to-location";
import {
  OWNER_STORE_AUX_BUTTON_CLASS,
  OWNER_STORE_CONTROL_CLASS,
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_SELECT_CLASS,
} from "@/lib/business/owner-store-stack";

interface LocationSelectorProps {
  region: string;
  city: string;
  onRegionChange: (v: string) => void;
  onCityChange: (v: string) => void;
  error?: string;
  label?: string;
  /**
   * true면 바깥 `section`·패딩 없이 그리드만 — 상위 "주소 입력" 블록 안에 끼울 때 사용
   */
  embedded?: boolean;
  /** embedded일 때 래퍼 div에 붙는 클래스 (예: `mt-2`) */
  className?: string;
  /** false면 라벨 옆 필수 `*` 숨김 (주소 텍스트와 택일인 경우 등) */
  showRequired?: boolean;
  /** 필리핀 4자리 ZIP으로 지역·동네 자동 선택 (등록된 번호만) */
  showZipLookup?: boolean;
}

function isValidRegionCity(regionId: string, cityId: string): boolean {
  const r = REGIONS.find((x) => x.id === regionId);
  return !!r?.cities.some((c) => c.id === cityId);
}

export function LocationSelector({
  region,
  city,
  onRegionChange,
  onCityChange,
  error,
  label = "거래 지역",
  embedded = false,
  className = "",
  showRequired = true,
  showZipLookup = true,
}: LocationSelectorProps) {
  const selectedRegion = REGIONS.find((r) => r.id === region);
  const cities = selectedRegion?.cities ?? [];
  const [zipDraft, setZipDraft] = useState("");
  const [zipMessage, setZipMessage] = useState<string | null>(null);

  const applyZip = useCallback(() => {
    const hit = lookupLocationByPhilippinesZip(zipDraft);
    if (!hit) {
      setZipMessage(
        normalizePhilippinesZipInput(zipDraft).length < 4
          ? "숫자 4자리를 입력한 뒤 적용해 주세요."
          : "등록된 우편번호가 아닙니다. 아래에서 지역·동네를 직접 선택해 주세요."
      );
      return;
    }
    if (!isValidRegionCity(hit.regionId, hit.cityId)) {
      setZipMessage("내부 목록과 맞지 않습니다. 직접 선택해 주세요.");
      return;
    }
    onRegionChange(hit.regionId);
    onCityChange(hit.cityId);
    setZipMessage(null);
  }, [zipDraft, onRegionChange, onCityChange]);

  const inner = (
    <>
      <p className="mb-2 text-[14px] font-medium text-gray-800">
        {label}
        {showRequired ? (
          <>
            {" "}
            <span className="text-red-500">*</span>
          </>
        ) : null}
      </p>
      <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
        <div className="min-w-0">
          <select
            value={region}
            onChange={(e) => {
              onRegionChange(e.target.value);
              onCityChange("");
            }}
            className={OWNER_STORE_SELECT_CLASS}
            aria-invalid={!!error}
            aria-label="Select region"
          >
            <option value="">Select region</option>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <select
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            className={OWNER_STORE_SELECT_CLASS}
            disabled={!region}
            aria-invalid={!!error}
            aria-label="Select area"
          >
            <option value="">Select area</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {showZipLookup ? (
        <>
          <div className={`mt-3 ${OWNER_STORE_FORM_GRID_2_CLASS} items-end`}>
            <div className="min-w-0">
              <label className="mb-1 block text-[14px] font-medium text-gray-700">
                ZIP 코드 (필리핀 4자리)
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                value={zipDraft}
                onChange={(e) => {
                  setZipDraft(normalizePhilippinesZipInput(e.target.value));
                  setZipMessage(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyZip();
                  }
                }}
                placeholder="예: 1226"
                maxLength={4}
                className={OWNER_STORE_CONTROL_CLASS}
                aria-label="ZIP or postal code"
              />
            </div>
            <div className="min-w-0">
              <button type="button" onClick={applyZip} className={OWNER_STORE_AUX_BUTTON_CLASS}>
                적용
              </button>
            </div>
          </div>
          {zipMessage ? (
            <p className="mt-2 text-[12px] text-amber-800">{zipMessage}</p>
          ) : null}
        </>
      ) : null}
      {error && <p className="mt-2 text-[13px] text-red-500">{error}</p>}
    </>
  );

  if (embedded) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <section className="border-b border-gray-100 bg-white px-4 py-4">{inner}</section>
  );
}
