"use client";

import { useEffect, useState } from "react";
import type { BusinessProfile } from "@/lib/types/business";
import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { REGIONS } from "@/lib/products/form-options";
import {
  OWNER_STORE_CONTROL_CLASS,
  OWNER_STORE_SELECT_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
} from "@/lib/business/owner-store-stack";
import { StoreAddressLocationSection } from "@/components/stores/StoreAddressLocationSection";
import { STORE_LOCATION_SECTION_HINT_MOCK_EDIT } from "@/lib/stores/store-address-form-ui";

export interface BusinessProfileEditFormValues {
  shopName: string;
  description: string;
  phone: string;
  kakaoId: string;
  region: string;
  city: string;
  addressStreetLine: string;
  addressDetail: string;
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
    addressStreetLine: profile.addressStreetLine ?? "",
    addressDetail: profile.addressDetail ?? "",
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
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
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
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
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
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
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
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
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
      <StoreAddressLocationSection
        sectionHint={STORE_LOCATION_SECTION_HINT_MOCK_EDIT}
        regionId={regionId}
        cityId={cityId}
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
        addressStreetLine={values.addressStreetLine}
        addressDetail={values.addressDetail}
        onAddressStreetLineChange={(v) =>
          setValues((x) => ({ ...x, addressStreetLine: v }))
        }
        onAddressDetailChange={(v) => setValues((x) => ({ ...x, addressDetail: v }))}
        showRequired={false}
      />
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
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
        className="w-full rounded-ui-rect bg-signature py-3 sam-text-body font-medium text-white"
      >
        {submitLabel}
      </button>
    </form>
  );
}
