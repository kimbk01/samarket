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
import {
  OWNER_STORE_CONTROL_CLASS,
  OWNER_STORE_CONTROL_REQUIRED_CLASS,
  OWNER_STORE_FIELD_LABEL_CLASS,
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_FORM_HINT_CLASS,
  OWNER_STORE_FORM_LEAD_CLASS,
  OWNER_STORE_SELECT_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
  OWNER_STORE_TEXTAREA_CLASS,
} from "@/lib/business/owner-store-stack";
import { fetchStoresTaxonomyDeduped } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  buildTradePublicLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import { inferAppLocationIdsFromUserAddress } from "@/lib/addresses/infer-app-location-from-user-address";
import Link from "next/link";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";

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
  const FB_PRIMARY = "#1C8DB8";
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
        const inferred = inferAppLocationIdsFromUserAddress(master);
        if (inferred?.regionId && inferred?.cityId) {
          const r = REGIONS.find((x) => x.id === inferred.regionId);
          const c = r?.cities.find((x) => x.id === inferred.cityId);
          const stripTail = (line: string, parts: Array<string | null | undefined>) => {
            let s = line.trim();
            const uniq = parts
              .map((x) => (x ?? "").trim())
              .filter(Boolean)
              .filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
            for (const token of uniq) {
              const re = new RegExp(String.raw`(?:,\s*|\s+)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\s*$`, "i");
              while (re.test(s)) s = s.replace(re, "").trim();
            }
            return s.trim();
          };
          // Store application uses:
          // - addressStreetLine: street/full address only (no unit/building duplication)
          // - addressDetail: unit/building + landmark (detail first is handled at display time)
          const streetRaw =
            (master.fullAddress ?? "").trim() ||
            (master.streetAddress ?? "").trim() ||
            buildTradePublicLine(master);
          const streetNoCountry = stripCountryFromAddressDisplayLine(streetRaw, master.countryName).trim();
          const summary = stripTail(streetNoCountry, [c?.name, r?.name]).trim();
          const unit = [master.unitFloorRoom, master.buildingName]
            .map((x) => (x ?? "").trim())
            .filter(Boolean)
            .join(" ")
            .trim();
          const landmark = (master.landmark ?? "").trim();
          const detail = [unit, landmark ? `Landmark: ${landmark}` : ""].filter(Boolean).join("\n").trim();
          setRegionId(inferred.regionId);
          setCityId(inferred.cityId);
          setValues((v) => ({
            ...v,
            region: r?.name ?? v.region,
            city: c?.name ?? v.city,
            addressStreetLine: summary || v.addressStreetLine,
            addressDetail: detail || v.addressDetail,
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
    <form onSubmit={handleSubmit} className={OWNER_STORE_STACK_Y_CLASS}>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 shadow-sm">
        <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
          <div className="min-w-0">
            <label className={OWNER_STORE_FIELD_LABEL_CLASS}>매장 ID</label>
            <input
              type="text"
              value={ownerHandle || ""}
              readOnly
              aria-readonly="true"
              className={`${OWNER_STORE_CONTROL_CLASS} bg-sam-app font-mono focus:border-[${FB_PRIMARY}] focus:ring-2 focus:ring-[${FB_PRIMARY}]/20`}
            />
          </div>
          <div className="min-w-0">
            <label className={OWNER_STORE_FIELD_LABEL_CLASS}>신청자</label>
            <input
              type="text"
              value={values.applicantNickname}
              className={OWNER_STORE_CONTROL_CLASS}
              readOnly
              aria-readonly="true"
            />
          </div>
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
          className={OWNER_STORE_CONTROL_REQUIRED_CLASS}
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
          className={`${OWNER_STORE_TEXTAREA_CLASS} border border-signature/20 bg-sam-app shadow-sm focus:border-signature focus:ring-2 focus:ring-signature/25`}
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
          className={OWNER_STORE_CONTROL_REQUIRED_CLASS}
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
          className={`${OWNER_STORE_CONTROL_CLASS} border border-signature/20 bg-sam-app shadow-sm focus:border-signature focus:ring-2 focus:ring-signature/25`}
          placeholder="연락 가능한 카카오 ID"
        />
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
        <p className="sam-text-body-secondary font-semibold text-sam-fg">주소 (내정보 · 주소록)</p>
        <p className="mt-1 sam-text-helper text-sam-muted">
          {addressReady
            ? addressDefault?.id
              ? stripCountryFromAddressDisplayLine(buildTradePublicLine(addressDefault), addressDefault.countryName) || "—"
              : "대표 주소가 없습니다. 주소록에서 대표 주소를 먼저 설정해 주세요."
            : "불러오는 중…"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            href="/mypage/addresses?returnTo=%2Fmy%2Fbusiness%2Fapply"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper font-semibold text-sam-fg hover:bg-sam-app"
          >
            주소록 열기
          </Link>
        </div>
      </div>
      <div>
        <p className={OWNER_STORE_FORM_HINT_CLASS}>
          어드민 «매장 설정»·<span className="font-medium text-sam-muted">/stores</span> 와 같은 1·2차
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
                const subs =
                  taxonomy && taxonomy.categories.length > 0
                    ? (() => {
                        const cat = taxonomy.categories.find((c) => c.slug === slug);
                        if (!cat) return [];
                        return taxonomy.topics.filter((t) => t.store_category_id === cat.id).map((t) => ({ slug: t.slug }));
                      })()
                    : listBrowseSubIndustries(slug);
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
        disabled={disabled || !computedStoreSlug.trim() || !addressDefault?.id}
        className="w-full rounded-ui-rect bg-[#1C8DB8] py-3 sam-text-body font-semibold text-white shadow-sm hover:bg-[#197fa5] active:bg-[#157292] disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
