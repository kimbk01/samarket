"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import {
  listBrowsePrimaryIndustries,
  listBrowseSubIndustries,
} from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { REGIONS } from "@/lib/products/form-options";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_FORM_HINT_CLASS,
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_FIELD_LABEL_CLASS,
  OWNER_STORE_PROFILE_SELECT_CLASS,
  OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
} from "@/lib/business/owner-store-stack";
import { fetchStoresTaxonomyDeduped } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { deriveStoreAddressFieldsFromUserAddressMaster } from "@/lib/business/derive-store-address-from-user-address-master";
import { OwnerAddressBookSnapshotCard } from "@/components/business/OwnerAddressBookSnapshotCard";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** `/my/business/apply` — 프로필에서 한 번만 폼에 주입 */
export type BusinessApplyProfileSeed = {
  applicantNickname: string;
  phoneDigits: string;
  regionId: string;
  cityId: string;
  addressStreetLine: string;
  addressDetail: string;
  /** 상점 소개 초안으로 쓸 프로필 한 줄(비어 있으면 폼 기본 유지) */
  profileBio: string;
  /** 신청자 @아이디(매장 ID 생성용) */
  username: string;
};

export interface BusinessApplyFormValues {
  /** 신청자 닉네임 — 프로필에서 가져오며 신청서에서 수정 불가 */
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
  /** 서버 규칙(@아이디-번호)로 계산된 매장 ID (읽기전용 표시) */
  computedStoreSlug?: string;
}

export function BusinessApplyForm({
  onSubmit,
  submitLabel = "신청하기",
  disabled = false,
  profileSeed = null,
  computedStoreSlug = "",
}: BusinessApplyFormProps) {
  const { t } = useI18n();
  const industryVersion = useBrowseIndustryDatasetVersion();
  const [taxonomy, setTaxonomy] = useState<{ categories: StoreTaxonomyCategory[]; topics: StoreTaxonomyTopic[] } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { json: jRaw } = await fetchStoresTaxonomyDeduped();
        const j = jRaw as { ok?: boolean; categories?: unknown; topics?: unknown };
        if (cancelled) return;
        if (j?.ok && Array.isArray(j.categories) && Array.isArray(j.topics)) {
          setTaxonomy({
            categories: j.categories as StoreTaxonomyCategory[],
            topics: j.topics as StoreTaxonomyTopic[],
          });
        } else {
          setTaxonomy(null);
        }
      } catch {
        if (!cancelled) setTaxonomy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const primaries = useMemo(() => {
    // DB taxonomy가 비어있으면 기존 목록으로 폴백
    if (!taxonomy || taxonomy.categories.length === 0) return listBrowsePrimaryIndustries();
    // DB는 symbol/nameKo가 없으므로 select 표시용으로 최소 변환
    return taxonomy.categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      nameKo: c.name,
      sortOrder: c.sort_order,
      symbol: "🏷️",
    }));
  }, [taxonomy, industryVersion]);
  const [values, setValues] = useState<BusinessApplyFormValues>(() => ({
    ...DEFAULT_VALUES,
    ...initialCategorySlugs(),
  }));
  const [regionId, setRegionId] = useState("");
  const [cityId, setCityId] = useState("");
  const [addressDefault, setAddressDefault] = useState<UserAddressDTO | null>(null);
  const [addressReady, setAddressReady] = useState(false);
  const profileHydratedRef = useRef(false);
  const addressLoadSeqRef = useRef(0);

  const ownerHandle = useMemo(() => {
    const u = String(profileSeed?.username ?? "").trim().replace(/^@+/, "");
    return u ? `@${u}` : "";
  }, [profileSeed?.username]);

  useEffect(() => {
    if (!profileSeed || profileHydratedRef.current) return;
    profileHydratedRef.current = true;
    const r = REGIONS.find((x) => x.id === profileSeed.regionId);
    const c = r?.cities.find((x) => x.id === profileSeed.cityId);
    setRegionId(profileSeed.regionId);
    setCityId(profileSeed.cityId);
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

  useEffect(() => {
    let cancelled = false;
    const load = async (opts?: { force?: boolean }) => {
      const seq = ++addressLoadSeqRef.current;
      setAddressReady(false);
      try {
        const snap = await fetchAddressDefaultsSnapshot({
          timeoutMs: 8_000,
          force: Boolean(opts?.force),
        });
        if (cancelled || seq !== addressLoadSeqRef.current) return;
        const master = (snap?.ok && snap.defaults ? (snap.defaults.master as any) : null) as UserAddressDTO | null;
        if (!master?.id) {
          setAddressDefault(null);
          return;
        }
        setAddressDefault(master);
        const derived = deriveStoreAddressFieldsFromUserAddressMaster(master);
        if (derived) {
          setRegionId(derived.regionId);
          setCityId(derived.cityId);
          setValues((v) => ({
            ...v,
            region: derived.regionName || v.region,
            city: derived.cityName || v.city,
            addressStreetLine: derived.addressStreetLine || v.addressStreetLine,
            addressDetail: derived.addressDetail || v.addressDetail,
          }));
        }
      } catch {
        if (!cancelled && seq === addressLoadSeqRef.current) setAddressDefault(null);
      } finally {
        if (!cancelled && seq === addressLoadSeqRef.current) setAddressReady(true);
      }
    };

    // always force-refresh on mount (avoid stale snapshot after address edits)
    void load({ force: true });

    const onFocus = () => void load({ force: true });
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load({ force: true });
    };
    const onAddressUpdated = () => void load({ force: true });
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressUpdated);
    };
  }, []);

  const subOptions = useMemo(
    () => {
      // DB taxonomy가 없으면 기존 목록으로 폴백
      if (!taxonomy || taxonomy.categories.length === 0) return listBrowseSubIndustries(values.categoryPrimarySlug);
      const cat = taxonomy.categories.find((c) => c.slug === values.categoryPrimarySlug);
      if (!cat) return [];
      return taxonomy.topics
        .filter((t) => t.store_category_id === cat.id)
        .map((t) => ({
          id: t.id,
          slug: t.slug,
          nameKo: t.name,
          primarySlug: values.categoryPrimarySlug,
          sortOrder: t.sort_order,
        }));
    },
    [values.categoryPrimarySlug, taxonomy, industryVersion]
  );

  useEffect(() => {
    const prim = primaries;
    if (prim.length === 0) return;
    setValues((v) => {
      const pOk = prim.some((p) => p.slug === v.categoryPrimarySlug);
      const primarySlug = pOk ? v.categoryPrimarySlug : prim[0]!.slug;
      const subs =
        taxonomy && taxonomy.categories.length > 0
          ? (() => {
              const cat = taxonomy.categories.find((c) => c.slug === primarySlug);
              if (!cat) return [];
              return taxonomy.topics.filter((t) => t.store_category_id === cat.id).map((t) => ({ slug: t.slug }));
            })()
          : listBrowseSubIndustries(primarySlug);
      const sOk = subs.some((s) => s.slug === v.categorySubSlug);
      const subSlug = sOk ? v.categorySubSlug : subs[0]?.slug ?? "";
      if (primarySlug === v.categoryPrimarySlug && subSlug === v.categorySubSlug) return v;
      return { ...v, categoryPrimarySlug: primarySlug, categorySubSlug: subSlug };
    });
  }, [industryVersion, primaries, taxonomy]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    onSubmit(values);
  };

  return (
    <form id="business-apply-form" onSubmit={handleSubmit} className={OWNER_STORE_STACK_Y_CLASS}>
      <OwnerStoreAdminDashSection title={t("business_phase7_178")}>
        <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
          <div className="min-w-0">
            <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_087")}</label>
            <input
              type="text"
              value={ownerHandle || ""}
              readOnly
              aria-readonly="true"
              className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} bg-sam-app font-mono`}
            />
          </div>
          <div className="min-w-0">
            <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_180")}</label>
            <input
              type="text"
              value={values.applicantNickname}
              className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} bg-sam-app`}
              readOnly
              aria-readonly="true"
            />
          </div>
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection title={t("business_phase7_144")}>
        <div>
          <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_142")}</label>
          <input
            type="text"
            value={values.shopName}
            onChange={(e) => setValues((v) => ({ ...v, shopName: e.target.value }))}
            required
            className={OWNER_STORE_PROFILE_CONTROL_CLASS}
            placeholder={t("business_phase7_143")}
          />
        </div>
        <div>
          <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_141")}</label>
          <textarea
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            rows={3}
            className={OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS}
            placeholder={t("business_phase7_145")}
          />
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection title={t("business_phase7_194")}>
        <div>
          <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_246")}</label>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={17}
            value={formatPhMobileDisplay(values.phone)}
            onChange={(e) =>
              setValues((v) => ({ ...v, phone: parsePhMobileInput(e.target.value) }))
            }
            required
            className={OWNER_STORE_PROFILE_CONTROL_CLASS}
            placeholder={PH_MOBILE_PLACEHOLDER}
          />
        </div>
        <div>
          <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_297")}</label>
          <input
            type="text"
            value={values.kakaoId}
            onChange={(e) => setValues((v) => ({ ...v, kakaoId: e.target.value }))}
            className={OWNER_STORE_PROFILE_CONTROL_CLASS}
            placeholder={t("business_phase7_193")}
          />
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection title={t("business_phase7_323")}>
        <OwnerAddressBookSnapshotCard
          returnToPath="/stores/owner/apply"
          addressReady={addressReady}
          addressDefault={addressDefault}
          bare
        />
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection title={t("business_phase7_190")}>
        <p className={OWNER_STORE_FORM_HINT_CLASS}>
          어드민 «매장 설정»·<span className="font-medium text-sam-muted">/stores</span> 와 같은 1·2차
          업종입니다. 1차 선택 후 세부(예: 한식·중식)를 고르세요.
        </p>
        <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
          <div className="min-w-0">
            <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_005")}</label>
            <select
              value={values.categoryPrimarySlug}
              onChange={(e) => {
                const slug = e.target.value;
                const subs =
                  taxonomy && taxonomy.categories.length > 0
                    ? (() => {
                        const cat = taxonomy.categories.find((c) => c.slug === slug);
                        if (!cat) return [];
                        return taxonomy.topics
                          .filter((t) => t.store_category_id === cat.id)
                          .map((t) => ({ slug: t.slug }));
                      })()
                    : listBrowseSubIndustries(slug);
                setValues((v) => ({
                  ...v,
                  categoryPrimarySlug: slug,
                  categorySubSlug: subs[0]?.slug ?? "",
                }));
              }}
              required
              className={OWNER_STORE_PROFILE_SELECT_CLASS}
            >
              {primaries.length === 0 ? (
                <option value="">{t("business_phase7_093")}</option>
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
            <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>{t("business_phase7_006")}</label>
            <select
              value={values.categorySubSlug}
              onChange={(e) => setValues((v) => ({ ...v, categorySubSlug: e.target.value }))}
              required
              disabled={subOptions.length === 0}
              className={OWNER_STORE_PROFILE_SELECT_CLASS}
            >
              {subOptions.length === 0 ? (
                <option value="">{t("business_phase7_089")}</option>
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
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection title={t("business_phase7_177")}>
        <button
          type="submit"
          disabled={disabled || !computedStoreSlug.trim() || !addressDefault?.id}
          className="min-h-[44px] w-full rounded-ui-rect bg-signature py-3 sam-text-body font-semibold text-white shadow-sm hover:opacity-95 active:opacity-90 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </OwnerStoreAdminDashSection>
    </form>
  );
}
