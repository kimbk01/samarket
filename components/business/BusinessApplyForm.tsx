"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import {
  listBrowsePrimaryIndustries,
  listBrowseSubIndustries,
} from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { REGIONS } from "@/lib/products/form-options";
import {
  OWNER_STORE_CONTROL_CLASS,
  OWNER_STORE_FIELD_LABEL_CLASS,
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_FORM_HINT_CLASS,
  OWNER_STORE_FORM_LEAD_CLASS,
  OWNER_STORE_SELECT_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
  OWNER_STORE_TEXTAREA_CLASS,
} from "@/lib/business/owner-store-stack";
import { StoreAddressLocationSection } from "@/components/stores/StoreAddressLocationSection";
import { STORE_LOCATION_SECTION_HINT_APPLY } from "@/lib/stores/store-address-form-ui";

/** `/my/business/apply` — 프로필에서 한 번만 폼에 주입 */
export type BusinessApplyProfileSeed = {
  applicantNickname: string;
  phoneDigits: string;
  regionId: string;
  cityId: string;
  postalCode: string;
  addressStreetLine: string;
  addressDetail: string;
  /** 상점 소개 초안으로 쓸 프로필 한 줄(비어 있으면 폼 기본 유지) */
  profileBio: string;
};

export interface BusinessApplyFormValues {
  /** 신청자 닉네임 — 프로필과 다르게 수정 가능 */
  applicantNickname: string;
  shopName: string;
  description: string;
  phone: string;
  kakaoId: string;
  region: string;
  city: string;
  addressStreetLine: string;
  addressDetail: string;
  /** 1차 업종 슬러그 — `/stores` 둘러보기·DB `store_categories.slug` 와 동일 */
  categoryPrimarySlug: string;
  /** 2차 업종 슬러그 — DB `store_topics.slug` (해당 1차 하위) */
  categorySubSlug: string;
}

const DEFAULT_VALUES: Omit<
  BusinessApplyFormValues,
  "categoryPrimarySlug" | "categorySubSlug"
> = {
  applicantNickname: "",
  shopName: "",
  description: "",
  phone: "",
  kakaoId: "",
  region: "",
  city: "",
  addressStreetLine: "",
  addressDetail: "",
};

function initialCategorySlugs(): Pick<
  BusinessApplyFormValues,
  "categoryPrimarySlug" | "categorySubSlug"
> {
  const prim = listBrowsePrimaryIndustries();
  const ps = prim[0]?.slug ?? "";
  const subs = listBrowseSubIndustries(ps);
  return { categoryPrimarySlug: ps, categorySubSlug: subs[0]?.slug ?? "" };
}

interface BusinessApplyFormProps {
  onSubmit: (values: BusinessApplyFormValues) => void;
  submitLabel?: string;
  disabled?: boolean;
  /** 로드되면 폼에 한 번만 반영(이후 사용자 수정 유지). 프로필 미로그인 시 null */
  profileSeed?: BusinessApplyProfileSeed | null;
}

export function BusinessApplyForm({
  onSubmit,
  submitLabel = "신청하기",
  disabled = false,
  profileSeed = null,
}: BusinessApplyFormProps) {
  const industryVersion = useBrowseIndustryDatasetVersion();
  const primaries = useMemo(() => listBrowsePrimaryIndustries(), [industryVersion]);
  const [values, setValues] = useState<BusinessApplyFormValues>(() => ({
    ...DEFAULT_VALUES,
    ...initialCategorySlugs(),
  }));
  const [regionId, setRegionId] = useState("");
  const [cityId, setCityId] = useState("");
  const [philPostZip, setPhilPostZip] = useState("");
  const profileHydratedRef = useRef(false);

  const commitPhilippinesZip = useCallback((code: string) => {
    setPhilPostZip(code);
  }, []);

  useEffect(() => {
    if (!profileSeed || profileHydratedRef.current) return;
    profileHydratedRef.current = true;
    const r = REGIONS.find((x) => x.id === profileSeed.regionId);
    const c = r?.cities.find((x) => x.id === profileSeed.cityId);
    setRegionId(profileSeed.regionId);
    setCityId(profileSeed.cityId);
    setPhilPostZip(profileSeed.postalCode.trim());
    setValues((v) => ({
      ...v,
      applicantNickname: profileSeed.applicantNickname.trim() || v.applicantNickname,
      phone: profileSeed.phoneDigits || v.phone,
      region: r?.name ?? "",
      city: c?.name ?? "",
      addressStreetLine: profileSeed.addressStreetLine || v.addressStreetLine,
      addressDetail: profileSeed.addressDetail || v.addressDetail,
      description: profileSeed.profileBio.trim()
        ? profileSeed.profileBio.trim()
        : v.description,
    }));
  }, [profileSeed]);

  const subOptions = useMemo(
    () => listBrowseSubIndustries(values.categoryPrimarySlug),
    [values.categoryPrimarySlug, industryVersion]
  );

  useEffect(() => {
    const prim = listBrowsePrimaryIndustries();
    if (prim.length === 0) return;
    setValues((v) => {
      const pOk = prim.some((p) => p.slug === v.categoryPrimarySlug);
      const primarySlug = pOk ? v.categoryPrimarySlug : prim[0]!.slug;
      const subs = listBrowseSubIndustries(primarySlug);
      const sOk = subs.some((s) => s.slug === v.categorySubSlug);
      const subSlug = sOk ? v.categorySubSlug : subs[0]?.slug ?? "";
      if (primarySlug === v.categoryPrimarySlug && subSlug === v.categorySubSlug) return v;
      return { ...v, categoryPrimarySlug: primarySlug, categorySubSlug: subSlug };
    });
  }, [industryVersion]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className={OWNER_STORE_STACK_Y_CLASS}>
      <div className="border-b border-gray-100 pb-5">
        <p className={OWNER_STORE_FORM_LEAD_CLASS}>신청자 정보</p>
        <p className={OWNER_STORE_FORM_HINT_CLASS}>
          내 프로필에서 가져온 값으로 채워지며, 이 신청서에서만 바꿔도{" "}
          <span className="font-medium text-gray-600">개인 프로필(내정보 → 프로필 수정)은 변경되지 않습니다</span>.
        </p>
        <div>
          <label className={OWNER_STORE_FIELD_LABEL_CLASS}>
            신청자 닉네임 *
          </label>
          <input
            type="text"
            value={values.applicantNickname}
            onChange={(e) =>
              setValues((v) => ({ ...v, applicantNickname: e.target.value }))
            }
            required
            maxLength={20}
            className={OWNER_STORE_CONTROL_CLASS}
            placeholder="프로필 닉네임과 같게 쓰거나 수정"
          />
        </div>
      </div>
      <div>
        <label className={OWNER_STORE_FIELD_LABEL_CLASS}>
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
        <label className={OWNER_STORE_FIELD_LABEL_CLASS}>
          상점 소개
        </label>
        <textarea
          value={values.description}
          onChange={(e) =>
            setValues((v) => ({ ...v, description: e.target.value }))
          }
          rows={3}
          className={OWNER_STORE_TEXTAREA_CLASS}
          placeholder="상점을 소개해 주세요"
        />
      </div>
      <div>
        <label className={OWNER_STORE_FIELD_LABEL_CLASS}>
          연락처
        </label>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={17}
          value={formatPhMobileDisplay(values.phone)}
          onChange={(e) =>
            setValues((v) => ({ ...v, phone: parsePhMobileInput(e.target.value) }))
          }
          className={OWNER_STORE_CONTROL_CLASS}
          placeholder={PH_MOBILE_PLACEHOLDER}
        />
      </div>
      <div>
        <label className={OWNER_STORE_FIELD_LABEL_CLASS}>
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
      <StoreAddressLocationSection
        sectionHint={STORE_LOCATION_SECTION_HINT_APPLY}
        regionId={regionId}
        cityId={cityId}
        onRegionChange={(id) => {
          setRegionId(id);
          setCityId("");
          setPhilPostZip("");
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
        philippinesZipSeed={philPostZip}
        onPhilippinesZipCommitted={commitPhilippinesZip}
      />
      <div>
        <p className={OWNER_STORE_FORM_HINT_CLASS}>
          어드민 «매장 설정»·<span className="font-medium text-gray-600">/stores</span> 와 같은 1·2차
          업종입니다. 1차 선택 후 세부(예: 한식·중식)를 고르세요.
        </p>
        <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
          <div className="min-w-0">
            <label className={OWNER_STORE_FIELD_LABEL_CLASS}>
              1차 업종
            </label>
            <select
              value={values.categoryPrimarySlug}
              onChange={(e) => {
                const slug = e.target.value;
                const subs = listBrowseSubIndustries(slug);
                setValues((v) => ({
                  ...v,
                  categoryPrimarySlug: slug,
                  categorySubSlug: subs[0]?.slug ?? "",
                }));
              }}
              required
              className={OWNER_STORE_SELECT_CLASS}
            >
              {primaries.length === 0 ? (
                <option value="">목록 없음</option>
              ) : (
                primaries.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.symbol} {p.nameKo}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="min-w-0">
            <label className={OWNER_STORE_FIELD_LABEL_CLASS}>
              2차 업종 (세부)
            </label>
            <select
              value={values.categorySubSlug}
              onChange={(e) =>
                setValues((v) => ({ ...v, categorySubSlug: e.target.value }))
              }
              required
              disabled={subOptions.length === 0}
              className={OWNER_STORE_SELECT_CLASS}
            >
              {subOptions.length === 0 ? (
                <option value="">먼저 1차를 선택</option>
              ) : (
                subOptions.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.nameKo}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-ui-rect bg-signature py-3 text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
