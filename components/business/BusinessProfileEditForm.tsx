"use client";

import { useEffect, useState } from "react";
import type { BusinessProfile } from "@/lib/types/business";
import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { REGIONS } from "@/lib/products/form-options";
import { LocationSelector } from "@/components/write/shared/LocationSelector";
import {
  OWNER_STORE_CONTROL_CLASS,
  OWNER_STORE_SELECT_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
} from "@/lib/business/owner-store-stack";

export interface BusinessProfileEditFormValues {
  shopName: string;
  description: string;
  phone: string;
  kakaoId: string;
  region: string;
  city: string;
  addressLabel: string;
  category: string;
}

function resolveRegionCityIds(regionName: string, cityName: string): { rid: string; cid: string } {
  const rn = regionName.trim();
  const cn = cityName.trim();
  const r = REGIONS.find((x) => x.name === rn);
  if (!r) return { rid: "", cid: "" };
  const c = r.cities.find((x) => x.name === cn);
  return { rid: r.id, cid: c?.id ?? "" };
}

interface BusinessProfileEditFormProps {
  profile: BusinessProfile;
  onSubmit: (values: BusinessProfileEditFormValues) => void;
  submitLabel?: string;
}

export function BusinessProfileEditForm({
  profile,
  onSubmit,
  submitLabel = "저장",
}: BusinessProfileEditFormProps) {
  const [values, setValues] = useState<BusinessProfileEditFormValues>({
    shopName: profile.shopName,
    description: profile.description,
    phone: profile.phone,
    kakaoId: profile.kakaoId,
    region: profile.region,
    city: profile.city,
    addressLabel: profile.addressLabel,
    category: profile.category,
  });
  const [regionId, setRegionId] = useState("");
  const [cityId, setCityId] = useState("");

  useEffect(() => {
    const { rid, cid } = resolveRegionCityIds(profile.region, profile.city);
    setRegionId(rid);
    setCityId(cid);
  }, [profile.region, profile.city]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
          className={OWNER_STORE_CONTROL_CLASS}
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
          placeholder={PH_MOBILE_PLACEHOLDER}
          className={OWNER_STORE_CONTROL_CLASS}
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          카카오톡 ID (placeholder)
        </label>
        <input
          type="text"
          value={values.kakaoId}
          onChange={(e) =>
            setValues((v) => ({ ...v, kakaoId: e.target.value }))
          }
          className={OWNER_STORE_CONTROL_CLASS}
        />
      </div>
      <div>
        <p className="mb-1 block text-[14px] font-medium text-gray-700">위치</p>
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
          placeholder="건물명, 층수, 도로명 등 (지역·동네는 위에서 선택)"
          className={OWNER_STORE_CONTROL_CLASS}
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-gray-700">
          카테고리
        </label>
        <select
          value={values.category}
          onChange={(e) =>
            setValues((v) => ({ ...v, category: e.target.value }))
          }
          className={OWNER_STORE_SELECT_CLASS}
        >
          <option value="일반">일반</option>
          <option value="디지털/가전">디지털/가전</option>
          <option value="의류">의류</option>
          <option value="생활">생활</option>
        </select>
      </div>
      <button
        type="submit"
        className="w-full rounded-lg bg-signature py-3 text-[15px] font-medium text-white"
      >
        {submitLabel}
      </button>
    </form>
  );
}
