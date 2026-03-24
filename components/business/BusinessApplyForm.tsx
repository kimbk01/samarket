"use client";

import { useEffect, useMemo, useState } from "react";
import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { listBrowsePrimaryIndustries } from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { REGIONS } from "@/lib/products/form-options";
import { LocationSelector } from "@/components/write/shared/LocationSelector";
import {
  OWNER_STORE_CONTROL_CLASS,
  OWNER_STORE_SELECT_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
} from "@/lib/business/owner-store-stack";

export interface BusinessApplyFormValues {
  shopName: string;
  description: string;
  phone: string;
  kakaoId: string;
  region: string;
  city: string;
  addressLabel: string;
  category: string;
}

const DEFAULT_VALUES: BusinessApplyFormValues = {
  shopName: "",
  description: "",
  phone: "",
  kakaoId: "",
  region: "",
  city: "",
  addressLabel: "",
  category: "식당",
};

interface BusinessApplyFormProps {
  onSubmit: (values: BusinessApplyFormValues) => void;
  submitLabel?: string;
  disabled?: boolean;
}

export function BusinessApplyForm({
  onSubmit,
  submitLabel = "신청하기",
  disabled = false,
}: BusinessApplyFormProps) {
  const industryVersion = useBrowseIndustryDatasetVersion();
  const primaryOptions = useMemo(
    () => listBrowsePrimaryIndustries().map((p) => p.nameKo),
    [industryVersion]
  );
  const [values, setValues] = useState<BusinessApplyFormValues>(DEFAULT_VALUES);
  const [regionId, setRegionId] = useState("");
  const [cityId, setCityId] = useState("");

  useEffect(() => {
    const names = listBrowsePrimaryIndustries().map((p) => p.nameKo);
    if (names.length === 0) return;
    setValues((v) => (names.includes(v.category) ? v : { ...v, category: names[0]! }));
  }, [industryVersion]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className={OWNER_STORE_STACK_Y_CLASS}>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          상점 이름 *
        </label>
        <input
          type="text"
          value={values.shopName}
          onChange={(e) =>
            setValues((v) => ({ ...v, shopName: e.target.value }))
          }
          required
          className={OWNER_STORE_CONTROL_CLASS}
          placeholder="상점 이름을 입력하세요"
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          상점 소개
        </label>
        <textarea
          value={values.description}
          onChange={(e) =>
            setValues((v) => ({ ...v, description: e.target.value }))
          }
          rows={3}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] text-gray-900"
          placeholder="상점을 소개해 주세요"
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          연락처
        </label>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
          className={OWNER_STORE_CONTROL_CLASS}
          placeholder={PH_MOBILE_PLACEHOLDER}
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          카카오톡 ID (선택)
        </label>
        <input
          type="text"
          value={values.kakaoId}
          onChange={(e) =>
            setValues((v) => ({ ...v, kakaoId: e.target.value }))
          }
          className={OWNER_STORE_CONTROL_CLASS}
          placeholder="연락 가능한 카카오 ID"
        />
      </div>
      <div>
        <p className="mb-1 block text-[14px] font-medium text-gray-700">위치</p>
        <p className="mb-2 text-[12px] text-gray-500">
          거래 글 등록과 동일한 지역·동네 목록에서 선택합니다.
        </p>
        <LocationSelector
          embedded
          region={regionId}
          city={cityId}
          onRegionChange={(id) => {
            setRegionId(id);
            setCityId("");
            const r = REGIONS.find((x) => x.id === id);
            setValues((v) => ({
              ...v,
              region: r?.name ?? "",
              city: "",
            }));
          }}
          onCityChange={(id) => {
            setCityId(id);
            const r = REGIONS.find((x) => x.id === regionId);
            const c = r?.cities.find((x) => x.id === id);
            setValues((v) => ({
              ...v,
              city: c?.name ?? "",
            }));
          }}
          label="지역 · 동네"
          showRequired={false}
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          상세 주소 (선택)
        </label>
        <input
          type="text"
          value={values.addressLabel}
          onChange={(e) =>
            setValues((v) => ({ ...v, addressLabel: e.target.value }))
          }
          className={OWNER_STORE_CONTROL_CLASS}
          placeholder="건물명, 층수, 도로명 등 (지역·동네는 위에서 선택)"
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          업종 (매장 유형)
        </label>
        <p className="mb-2 text-[12px] text-gray-500">
          어드민 «매장 설정 (매장 신청)» 과 동일한 1차 업종 목록입니다.
        </p>
        <select
          value={values.category}
          onChange={(e) =>
            setValues((v) => ({ ...v, category: e.target.value }))
          }
          className={OWNER_STORE_SELECT_CLASS}
        >
          {primaryOptions.length === 0 ? (
            <option value="기타">기타</option>
          ) : (
            primaryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))
          )}
        </select>
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-lg bg-signature py-3 text-[15px] font-medium text-white disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
