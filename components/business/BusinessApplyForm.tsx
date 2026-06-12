"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PH_MOBILE_PLUS63_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { formatPhMobileDisplayPlus63, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import {
  listBrowsePrimaryIndustries,
  listBrowseSubIndustries,
} from "@/lib/stores/browse-taxonomy-seed-queries";
import { REGIONS } from "@/lib/products/form-options";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_SELECT_CLASS,
  OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
} from "@/lib/business/owner-store-stack";
import {
  OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS,
  OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS,
  OWNER_STORE_ADMIN_FOOTER_FORM_PAD_CLASS,
  OWNER_STORE_ADMIN_FOOTER_INNER_CLASS,
  OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS,
  ownerStoreAdminFooterFixedClass,
} from "@/lib/business/owner-admin-footer-actions";
import { fetchStoresTaxonomyDeduped } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { deriveStoreAddressFieldsFromUserAddressMaster } from "@/lib/business/derive-store-address-from-user-address-master";
import { OwnerAddressBookSnapshotCard } from "@/components/business/OwnerAddressBookSnapshotCard";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveStoreTaxonomyPrimaryDisplayName, resolveStoreTaxonomyTopicDisplayName } from "@/lib/stores/resolve-store-taxonomy-display-name";

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
  /** 관리자 검토용 요청 사항 */
  requestNote: string;
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

/** 입점 신청 — 매장 어드민(기본 정보)과 동일한 14px 라벨 톤 */
const APPLY_FIELD_LABEL_CLASS = "mb-1 block sam-text-body font-semibold text-sam-fg";

/** 프로필·매장 ID 등 표시 전용 — 입력 박스 없음, 입력 글자(+2px)보다 2pt 크고 굵게 */
const APPLY_DISPLAY_VALUE_CLASS =
  "block min-w-0 pt-0.5 text-[length:calc(var(--sm-font-input)+2px)] font-bold leading-snug text-sam-fg";

const APPLY_DISPLAY_VALUE_MONO_CLASS = `${APPLY_DISPLAY_VALUE_CLASS} font-mono`;

/** 전화번호 — 편집 가능하나 테두리·배경 없는 텍스트형 */
const APPLY_PHONE_VALUE_CLASS = `${APPLY_DISPLAY_VALUE_CLASS} w-full border-0 bg-transparent p-0 shadow-none outline-none ring-0 placeholder:font-normal placeholder:text-[length:var(--sm-font-input)] placeholder:text-sam-meta focus:border-0 focus:outline-none focus:ring-0`;

/** 1·2차 업종 select — 우측 ▼ (native appearance-none 보조) */
const APPLY_SELECT_WRAP_CLASS = "relative min-w-0 w-full";
const APPLY_SELECT_CHEVRON_CLASS =
  "pointer-events-none absolute inset-y-0 right-[18px] flex items-center sam-text-body-secondary text-sam-muted";
/** en 라벨 2줄 시에도 select 상단·높이를 맞춤 */
const APPLY_CATEGORY_GRID_CLASS = `${OWNER_STORE_FORM_GRID_2_CLASS} items-start`;
const APPLY_CATEGORY_COL_CLASS = "flex min-w-0 flex-col";
const APPLY_CATEGORY_LABEL_CLASS = `${APPLY_FIELD_LABEL_CLASS} mb-1 min-h-[2.75rem] leading-snug`;
const APPLY_CATEGORY_SELECT_CLASS = `${OWNER_STORE_PROFILE_SELECT_CLASS} block w-full min-h-[var(--sam-input-min-height)]`;

const DEFAULT_VALUES: Omit<
  BusinessApplyFormValues,
  "categoryPrimarySlug" | "categorySubSlug"
> = {
  applicantNickname: "",
  shopName: "",
  description: "",
  requestNote: "",
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
  submitLabel,
  disabled = false,
  profileSeed = null,
  computedStoreSlug = "",
}: BusinessApplyFormProps) {
  const { t, language } = useI18n();
  const router = useRouter();
  const resolvedSubmitLabel = submitLabel ?? t("business_phase7_465");
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
    const fallback = listBrowsePrimaryIndustries();
    const bySlug = new Map(fallback.map((p) => [p.slug, p]));
    if (!taxonomy || taxonomy.categories.length === 0) return fallback;
    return taxonomy.categories.map((c) => {
      const fb = bySlug.get(c.slug);
      return {
        id: c.id,
        slug: c.slug,
        nameKo: c.name,
        nameEn: c.name_en ?? fb?.nameEn ?? null,
        sortOrder: c.sort_order,
        symbol: fb?.symbol ?? "🏷️",
      };
    });
  }, [taxonomy]);
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
      const fallbackSubs = listBrowseSubIndustries(values.categoryPrimarySlug);
      const fallbackBySlug = new Map(fallbackSubs.map((s) => [s.slug, s]));
      if (!taxonomy || taxonomy.categories.length === 0) return fallbackSubs;
      const cat = taxonomy.categories.find((c) => c.slug === values.categoryPrimarySlug);
      if (!cat) return [];
      return taxonomy.topics
        .filter((t) => t.store_category_id === cat.id)
        .map((t) => {
          const fb = fallbackBySlug.get(t.slug);
          return {
            id: t.id,
            slug: t.slug,
            nameKo: t.name,
            nameEn: t.name_en ?? fb?.nameEn ?? null,
            primarySlug: values.categoryPrimarySlug,
            sortOrder: t.sort_order,
          };
        });
    },
    [values.categoryPrimarySlug, taxonomy]
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
  }, [primaries, taxonomy]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    onSubmit(values);
  };

  const submitDisabled =
    disabled || !computedStoreSlug.trim() || !addressDefault?.id;

  return (
    <>
      <form
        id="business-apply-form"
        onSubmit={handleSubmit}
        className={`${OWNER_STORE_STACK_Y_CLASS} ${OWNER_STORE_ADMIN_FOOTER_FORM_PAD_CLASS} [&_.owner-store-admin-dash-section__header_h2]:text-base [&_.owner-store-admin-dash-section__header_h2]:font-bold`}
      >
      <OwnerStoreAdminDashSection title={t("business_phase7_178")}>
        <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
          <div className="min-w-0">
            <label className={APPLY_FIELD_LABEL_CLASS}>{t("business_phase7_087")}</label>
            <p className={APPLY_DISPLAY_VALUE_MONO_CLASS}>{ownerHandle || "—"}</p>
          </div>
          <div className="min-w-0">
            <label className={APPLY_FIELD_LABEL_CLASS}>{t("business_phase7_180")}</label>
            <p className={APPLY_DISPLAY_VALUE_CLASS}>{values.applicantNickname.trim() || "—"}</p>
          </div>
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection title={t("business_phase7_144")}>
        <div>
          <label className={APPLY_FIELD_LABEL_CLASS}>{t("business_phase7_142")}</label>
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
          <label className={APPLY_FIELD_LABEL_CLASS}>{t("business_phase7_141")}</label>
          <textarea
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            rows={3}
            className={OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS}
            placeholder={t("business_phase7_145")}
          />
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection title={t("business_phase7_693")}>
        <div>
          <label className={APPLY_FIELD_LABEL_CLASS}>{t("business_phase7_694")}</label>
          <textarea
            value={values.requestNote}
            onChange={(e) => setValues((v) => ({ ...v, requestNote: e.target.value.slice(0, 1000) }))}
            rows={4}
            className={OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS}
            placeholder={t("business_phase7_695")}
          />
          <p className="mt-1.5 sam-text-helper text-sam-muted">
            {values.requestNote.trim().length}/1000
          </p>
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection title={t("business_phase7_194")}>
        <div>
          <label className={APPLY_FIELD_LABEL_CLASS}>{t("business_phase7_246")}</label>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={18}
            value={formatPhMobileDisplayPlus63(values.phone)}
            onChange={(e) =>
              setValues((v) => ({ ...v, phone: parsePhMobileInput(e.target.value) }))
            }
            required
            className={APPLY_PHONE_VALUE_CLASS}
            placeholder={PH_MOBILE_PLUS63_PLACEHOLDER}
          />
        </div>
        <div>
          <label className={APPLY_FIELD_LABEL_CLASS}>{t("business_phase7_297")}</label>
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
        <div className={APPLY_CATEGORY_GRID_CLASS}>
          <div className={APPLY_CATEGORY_COL_CLASS}>
            <label className={APPLY_CATEGORY_LABEL_CLASS}>{t("business_phase7_005")}</label>
            <div className={APPLY_SELECT_WRAP_CLASS}>
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
                className={APPLY_CATEGORY_SELECT_CLASS}
              >
                {primaries.length === 0 ? (
                  <option value="">{t("business_phase7_093")}</option>
                ) : (
                  primaries.map((p) => (
                    <option key={p.id} value={p.slug}>
                      {resolveStoreTaxonomyPrimaryDisplayName(language, p.slug, p.nameKo, p.nameEn)}
                    </option>
                  ))
                )}
              </select>
              <span className={APPLY_SELECT_CHEVRON_CLASS} aria-hidden>
                ▼
              </span>
            </div>
          </div>
          <div className={APPLY_CATEGORY_COL_CLASS}>
            <label className={APPLY_CATEGORY_LABEL_CLASS}>{t("business_phase7_006")}</label>
            <div className={APPLY_SELECT_WRAP_CLASS}>
              <select
                value={values.categorySubSlug}
                onChange={(e) => setValues((v) => ({ ...v, categorySubSlug: e.target.value }))}
                required
                disabled={subOptions.length === 0}
                className={APPLY_CATEGORY_SELECT_CLASS}
              >
                {subOptions.length === 0 ? (
                  <option value="">{t("business_phase7_089")}</option>
                ) : (
                  subOptions.map((s) => (
                    <option key={s.id} value={s.slug}>
                      {resolveStoreTaxonomyTopicDisplayName(language, s.slug, s.nameKo, s.nameEn)}
                    </option>
                  ))
                )}
              </select>
              <span className={APPLY_SELECT_CHEVRON_CLASS} aria-hidden>
                ▼
              </span>
            </div>
          </div>
        </div>
      </OwnerStoreAdminDashSection>
      </form>

      <BodyPortal>
        <footer
          role="contentinfo"
          aria-label={t("business_phase7_177")}
          className={ownerStoreAdminFooterFixedClass()}
        >
          <div className={OWNER_STORE_ADMIN_FOOTER_INNER_CLASS}>
            <div className={OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => router.push("/stores/owner")}
                className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
              >
                {t("common_cancel")}
              </button>
              <button
                type="submit"
                form="business-apply-form"
                disabled={submitDisabled}
                className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
              >
                {resolvedSubmitLabel}
              </button>
            </div>
          </div>
        </footer>
      </BodyPortal>
    </>
  );
}
