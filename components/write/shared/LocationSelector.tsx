"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REGIONS } from "@/lib/products/form-options";
import {
  finalizePhilippinesZipCode,
  getPhilippinesZipCodesForLocation,
  isPhilippinesZipInputComplete,
  lookupLocationByPhilippinesZip,
  normalizePhilippinesZipInput,
} from "@/lib/products/zip-to-location";
import {
  OWNER_STORE_AUX_BUTTON_INLINE_COMPACT_CLASS,
  OWNER_STORE_CONTROL_CLASS,
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_FORM_LEAD_CLASS,
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
  /** PhilPost 4자리 ZIP으로 지역·동네 자동 선택 (표+권역 보조) */
  showZipLookup?: boolean;
  /**
   * 저장된 우편번호(4자리) — 편집 시 동네별 ZIP 후보와 맞으면 입력칸에 우선 반영.
   * (부모 `postalCode` state를 넘기면 됨. 지역·동네가 바뀔 때만 이 값으로 시드합니다.)
   */
  philippinesZipSeed?: string;
  /**
   * PhilPost 4자리가 확정될 때 — 지역·동네 선택으로 자동 채움, 또는 「적용」·ZIP역검색 성공 시.
   * 주소 시트 등에서는 이 콜백만으로 DB `postal_code`와 맞추면 됩니다.
   */
  onPhilippinesZipCommitted?: (fourDigitZip: string) => void;
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
  philippinesZipSeed,
  onPhilippinesZipCommitted,
}: LocationSelectorProps) {
  const selectedRegion = REGIONS.find((r) => r.id === region);
  const cities = selectedRegion?.cities ?? [];
  const [zipDraft, setZipDraft] = useState("");
  const [zipMessage, setZipMessage] = useState<string | null>(null);
  const prevRegionCityRef = useRef<{ r: string; c: string } | null>(null);

  const zipCodesForLocation = useMemo(
    () => getPhilippinesZipCodesForLocation(region, city),
    [region, city]
  );

  /** 지역·동네가 바뀔 때만 ZIP 입력칸을 동네 후보(또는 저장분 seed)로 맞춤 — 별도 ZIP `<select>` 없음 */
  useEffect(() => {
    const codes = zipCodesForLocation;
    const prev = prevRegionCityRef.current;
    const locChanged = !prev || prev.r !== region || prev.c !== city;
    prevRegionCityRef.current = { r: region, c: city };

    if (!city || codes.length === 0) {
      setZipDraft("");
      return;
    }
    if (!locChanged) {
      return;
    }

    setZipDraft(() => {
      const raw = philippinesZipSeed?.trim() ?? "";
      const seed = raw ? finalizePhilippinesZipCode(raw) : null;
      if (seed && codes.includes(seed)) return seed;
      return codes[0]!;
    });
  }, [region, city, zipCodesForLocation, philippinesZipSeed]);

  /** 현재 동네에 맞는 4자리가 되면 부모 postal 등과 동기 */
  useEffect(() => {
    if (!onPhilippinesZipCommitted) return;
    if (!city || zipCodesForLocation.length === 0) return;
    const fin = finalizePhilippinesZipCode(zipDraft);
    if (!fin || !zipCodesForLocation.includes(fin)) return;
    onPhilippinesZipCommitted(fin);
  }, [zipDraft, region, city, zipCodesForLocation, onPhilippinesZipCommitted]);

  /** 4자리 ZIP이면 ZIP→지역·동네, 아니면 현재 동네 기준 확정 ZIP 반영 */
  const applyZipOrNeighborhood = useCallback(() => {
    if (isPhilippinesZipInputComplete(zipDraft)) {
      const hit = lookupLocationByPhilippinesZip(zipDraft);
      if (!hit) {
        setZipMessage("매칭되는 지역이 없습니다.");
        return;
      }
      if (!isValidRegionCity(hit.regionId, hit.cityId)) {
        setZipMessage("목록에 없는 조합입니다.");
        return;
      }
      onRegionChange(hit.regionId);
      onCityChange(hit.cityId);
      setZipMessage(null);
      const finalized = finalizePhilippinesZipCode(zipDraft);
      if (finalized) onPhilippinesZipCommitted?.(finalized);
      return;
    }

    if (!city || zipCodesForLocation.length === 0) {
      setZipMessage("4자리 ZIP을 입력하거나 지역·동네를 선택해 주세요.");
      return;
    }
    const fin = finalizePhilippinesZipCode(zipDraft);
    const pick =
      fin && zipCodesForLocation.includes(fin) ? fin : zipCodesForLocation[0]!;
    setZipDraft(pick);
    setZipMessage(null);
    onPhilippinesZipCommitted?.(pick);
  }, [
    zipDraft,
    city,
    zipCodesForLocation,
    onRegionChange,
    onCityChange,
    onPhilippinesZipCommitted,
    setZipDraft,
    setZipMessage,
  ]);

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
        <div className="mt-3">
          <p className={OWNER_STORE_FORM_LEAD_CLASS}>ZIP 코드 (PhilPost 4자리)</p>
          <div className="grid min-w-0 grid-cols-[1fr_auto] items-stretch gap-2">
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
                  applyZipOrNeighborhood();
                }
              }}
              maxLength={4}
              className={`min-w-0 ${OWNER_STORE_CONTROL_CLASS}`}
              aria-label="PhilPost ZIP 4자리"
            />
            <button type="button" onClick={applyZipOrNeighborhood} className={OWNER_STORE_AUX_BUTTON_INLINE_COMPACT_CLASS}>
              적용
            </button>
          </div>
          {zipMessage ? (
            <p className="mt-2 text-[12px] text-amber-800">{zipMessage}</p>
          ) : null}
        </div>
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
