"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";
import { PH_LOCAL_09_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import {
  formatPhMobileDisplay,
  normalizePhMobileDb,
  parsePhMobileInput,
} from "@/lib/utils/ph-mobile";
import { REGIONS } from "@/lib/products/form-options";
import { StoreAddressLocationSection } from "@/components/stores/StoreAddressLocationSection";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import {
  OWNER_STORE_CONTROL_CLASS,
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_SELECT_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
} from "@/lib/business/owner-store-stack";
import { listBrowsePrimaryIndustries } from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { STORE_LOCATION_SECTION_HINT_STORE_PUBLIC } from "@/lib/stores/store-address-form-ui";

function resolveRegionCityIds(regionRaw: string, cityRaw: string): { rid: string; cid: string } {
  const rn = regionRaw.trim();
  const cn = cityRaw.trim();
  const r = REGIONS.find((x) => x.id === rn) ?? REGIONS.find((x) => x.name === rn);
  if (!r) return { rid: "", cid: "" };
  const c = r.cities.find((x) => x.id === cn) ?? r.cities.find((x) => x.name === cn);
  return { rid: r.id, cid: c?.id ?? "" };
}

type BasicValues = {
  shopName: string;
  description: string;
  phone: string;
  kakaoId: string;
  email: string;
  websiteUrl: string;
  profileImageUrl: string;
  addressStreetLine: string;
  addressDetail: string;
  /** DB 분류 미사용 시 임시 업종(표시용) */
  category: string;
};

type StoreRelEmbed = { name?: string } | { name?: string }[] | null | undefined;

function storeEmbedName(rel: StoreRelEmbed): string {
  if (rel == null) return "";
  if (Array.isArray(rel)) return (rel[0]?.name ?? "").trim();
  return (rel.name ?? "").trim();
}

function rowToBasicValues(row: StoreRow): BasicValues {
  const { intro, kakao } = splitStoreDescriptionAndKakao(row.description, row.kakao_id ?? null);
  const a1 = (row.address_line1 ?? "").trim();
  const d = (row.district ?? "").trim();
  const street = a1 || d;
  const detail = (row.address_line2 ?? "").trim();
  return {
    shopName: row.store_name ?? "",
    description: intro ?? "",
    phone: row.phone ?? "",
    kakaoId: kakao ?? "",
    email: parsePhMobileInput(row.email ?? ""),
    websiteUrl: row.website_url ?? "",
    profileImageUrl: row.profile_image_url ?? "",
    addressStreetLine: street,
    addressDetail: detail,
    category: row.business_type ?? "",
  };
}

function patchErrorToUserMessage(code: string): string | null {
  const m: Record<string, string> = {
    no_fields: "변경할 내용이 없습니다. 잠시 후 다시 시도해 주세요.",
    store_not_editable: "현재 상태에서는 매장 정보를 수정할 수 없습니다.",
    store_load_failed: "매장 정보를 불러오지 못해 저장할 수 없습니다. 새로고침 후 다시 시도해 주세요.",
    invalid_ph_phone: "전화번호를 09 xx xxx xxxx 형식(11자리)으로 입력해 주세요.",
    supabase_unconfigured: "서버 저장소 설정을 확인해 주세요.",
    unauthorized: "로그인이 필요합니다.",
    forbidden: "이 매장을 수정할 권한이 없습니다.",
    store_not_found: "매장을 찾을 수 없습니다.",
    update_no_row: "저장이 반영되지 않았습니다. 새로고침 후 다시 시도해 주세요.",
    invalid_store_category_id: "업종(1차 분류) 값이 올바르지 않습니다. 새로고침 후 다시 선택해 주세요.",
    invalid_store_topic_id: "세부 주제 값이 올바르지 않습니다. 다시 선택해 주세요.",
    store_topic_not_found: "선택한 세부 주제를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 선택해 주세요.",
    store_topic_category_mismatch: "세부 주제가 선택한 업종과 맞지 않습니다. 업종·주제를 다시 맞춰 주세요.",
    store_name_too_short: "매장 이름은 2자 이상 입력해 주세요.",
  };
  return m[code] ?? null;
}

export type OwnerStoreBasicInfoFormProps = {
  storeId: string;
  row: StoreRow;
  onSaved: () => void;
  onCancel: () => void;
};

export function OwnerStoreBasicInfoForm({
  storeId,
  row,
  onSaved,
  onCancel,
}: OwnerStoreBasicInfoFormProps) {
  const pathname = usePathname();
  const hideAppBottomNav =
    (pathname?.startsWith("/my/settings") ?? false) ||
    pathname === "/my/logout" ||
    isProfileEditPath(pathname);
  const dockAboveBottomNav =
    !hideAppBottomNav && (pathname?.startsWith("/my") ?? false);

  const industryVersion = useBrowseIndustryDatasetVersion();
  const identityEditable = row.owner_can_edit_store_identity === true;
  const primaryIndustryNames = useMemo(
    () => listBrowsePrimaryIndustries().map((p) => p.nameKo),
    [industryVersion]
  );

  const [values, setValues] = useState<BasicValues>(() => rowToBasicValues(row));
  const [regionId, setRegionId] = useState("");
  const [cityId, setCityId] = useState("");
  const [taxonomy, setTaxonomy] = useState<{
    categories: StoreTaxonomyCategory[];
    topics: StoreTaxonomyTopic[];
  } | null>(null);
  const [taxonomyMeta, setTaxonomyMeta] = useState<{
    source?: string;
    store_topics_table?: string;
    category_count?: number;
    topic_count?: number;
  } | null>(null);
  const [taxonomyLoading, setTaxonomyLoading] = useState(true);
  const [storeCategoryId, setStoreCategoryId] = useState("");
  const [storeTopicId, setStoreTopicId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profileFileInputRef = useRef<HTMLInputElement>(null);

  const useDbTaxonomy = Boolean(
    taxonomy && taxonomy.categories.length > 0 && taxonomy.topics.length > 0
  );

  const topicsForCategory = useMemo(() => {
    if (!storeCategoryId || !taxonomy?.topics.length) return [];
    return taxonomy.topics.filter((t) => t.store_category_id === storeCategoryId);
  }, [taxonomy, storeCategoryId]);

  useEffect(() => {
    if (!identityEditable) return;
    if (taxonomy && taxonomy.categories.length > 0 && taxonomy.topics.length > 0) return;
    if (primaryIndustryNames.length === 0) return;
    setValues((v) =>
      primaryIndustryNames.includes(v.category) ? v : { ...v, category: primaryIndustryNames[0]! }
    );
  }, [primaryIndustryNames, taxonomy, identityEditable]);

  useEffect(() => {
    let cancelled = false;
    setTaxonomyLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/stores/taxonomy", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        setTaxonomyMeta(
          j?.meta && typeof j.meta === "object"
            ? (j.meta as {
                source?: string;
                store_topics_table?: string;
                category_count?: number;
                topic_count?: number;
              })
            : null
        );
        if (j?.ok && Array.isArray(j.categories) && Array.isArray(j.topics)) {
          setTaxonomy({ categories: j.categories, topics: j.topics });
        } else {
          setTaxonomy(null);
        }
      } catch {
        if (!cancelled) {
          setTaxonomy(null);
          setTaxonomyMeta(null);
        }
      } finally {
        if (!cancelled) setTaxonomyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!taxonomy?.categories.length) {
      setStoreCategoryId("");
      setStoreTopicId("");
      return;
    }
    const fromRowCat = row.store_category_id?.trim() ?? "";
    const fromRowTopic = row.store_topic_id?.trim() ?? "";
    if (fromRowCat && taxonomy.categories.some((c) => c.id === fromRowCat)) {
      setStoreCategoryId(fromRowCat);
      if (fromRowTopic && taxonomy.topics.some((t) => t.id === fromRowTopic)) {
        setStoreTopicId(fromRowTopic);
      } else {
        const first = taxonomy.topics.find((t) => t.store_category_id === fromRowCat);
        setStoreTopicId(first?.id ?? "");
      }
      return;
    }
    const legacyName = (row.business_type ?? "").trim();
    const match = legacyName
      ? taxonomy.categories.find((c) => c.name === legacyName)
      : undefined;
    if (match) {
      setStoreCategoryId(match.id);
      const firstT = taxonomy.topics.find((t) => t.store_category_id === match.id);
      setStoreTopicId(firstT?.id ?? "");
      return;
    }
    setStoreCategoryId(taxonomy.categories[0]!.id);
    const firstT = taxonomy.topics.find((t) => t.store_category_id === taxonomy.categories[0]!.id);
    setStoreTopicId(firstT?.id ?? "");
  }, [row, taxonomy]);

  useEffect(() => {
    setValues(rowToBasicValues(row));
    const { rid, cid } = resolveRegionCityIds(row.region ?? "", row.city ?? "");
    setRegionId(rid);
    setCityId(cid);
  }, [row]);

  const uploadProfileImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/upload-image`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok || !j.url) {
        const msg =
          typeof j?.message === "string" && j.message.trim()
            ? j.message
            : j?.error === "storage_bucket_missing"
              ? "Storage 버킷 store-product-images가 없습니다. Supabase SQL(매장 이미지 버킷)을 실행하거나 마이그레이션을 적용해 주세요."
              : typeof j?.error === "string"
                ? j.error
                : "이미지 업로드에 실패했습니다.";
        setError(msg);
        return;
      }
      setValues((v) => ({ ...v, profileImageUrl: j.url as string }));
    } catch {
      setError("이미지 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const saveBasicInfo = async () => {
    setError(null);
    const phoneDigits = parsePhMobileInput(values.phone);
    const phoneDb = phoneDigits ? normalizePhMobileDb(phoneDigits) : null;
    if (phoneDigits && !phoneDb) {
      setError("전화번호를 09 xx xxx xxxx 형식(11자리)으로 입력해 주세요.");
      return;
    }
    const gcashDb = normalizePhMobileDb(values.email);
    if (identityEditable) {
      const name = values.shopName.trim();
      if (name.length < 2) {
        setError("매장 이름은 2자 이상 입력해 주세요.");
        return;
      }
      if (
        useDbTaxonomy &&
        storeCategoryId &&
        topicsForCategory.length > 0 &&
        !storeTopicId.trim()
      ) {
        setError("세부 주제를 선택해 주세요.");
        return;
      }
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        identityEditable
          ? "기본 정보(로고·매장명·소개·연락처·위치·상세 주소·업종 등)를 저장합니다. 계속할까요?"
          : "로고·소개·연락처·위치·상세 주소만 저장합니다. 매장 이름·업종·세부 주제는 DB에 고정되어 있으며, 관리자가 허용한 경우에만 수정할 수 있습니다. 계속할까요?"
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      /** 매장 설정(영업시간·갤러리 등) 필드는 보내지 않음 — 이 화면 전용 PATCH */
      const basicInfoPatch: Record<string, unknown> = {
        description: values.description.trim() || null,
        phone: phoneDb,
        kakao_id: values.kakaoId.trim() || null,
        region: regionId.trim() || null,
        city: cityId.trim() || null,
        district: values.addressStreetLine.trim() || null,
        address_line1: values.addressStreetLine.trim() || null,
        address_line2: values.addressDetail.trim() || null,
        email: gcashDb,
        website_url: values.websiteUrl.trim() || null,
        profile_image_url: values.profileImageUrl.trim() || null,
      };
      if (identityEditable) {
        basicInfoPatch.store_name = values.shopName.trim();
        basicInfoPatch.business_type = useDbTaxonomy
          ? (taxonomy!.categories.find((c) => c.id === storeCategoryId)?.name?.trim() ||
              values.category.trim() ||
              null)
          : values.category.trim() || null;
        if (useDbTaxonomy) {
          basicInfoPatch.store_category_id = storeCategoryId || null;
          basicInfoPatch.store_topic_id = storeTopicId || null;
        }
      }
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basicInfoPatch),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("로그인이 필요합니다.");
        return;
      }
      if (!j?.ok || !j?.store) {
        const code = typeof j?.error === "string" ? j.error : "";
        setError(
          code === "invalid_ph_phone"
            ? "전화번호를 09 xx xxx xxxx 형식(11자리)으로 입력해 주세요."
            : patchErrorToUserMessage(code) ?? (code ? code : "저장에 실패했습니다.")
        );
        return;
      }
      onSaved();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const actionBarInner = (
    <>
      {error ? (
        <div
          className="mb-2 max-h-24 overflow-y-auto rounded-ui-rect border border-red-100 bg-red-50 px-3 py-2 text-[12px] leading-snug text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-row gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] min-w-0 flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-[15px] font-medium text-sam-fg shadow-sm"
        >
          취소
        </button>
        <button
          type="submit"
          form="owner-store-basic-info-form"
          disabled={submitting || uploading}
          className="min-h-[48px] min-w-0 flex-1 rounded-ui-rect bg-signature px-3 py-3 text-[15px] font-medium text-white shadow-sm disabled:opacity-50"
        >
          {submitting ? "저장 중…" : "저장"}
        </button>
      </div>
    </>
  );

  return (
    <>
      <form
        id="owner-store-basic-info-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void saveBasicInfo();
        }}
        className={`max-w-full min-w-0 ${OWNER_STORE_STACK_Y_CLASS} pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(7.25rem+env(safe-area-inset-bottom,0px))]`}
      >
        <div>
          <label className="mb-2 block text-[14px] font-medium text-sam-fg">대표 이미지 (로고)</label>
          <div>
            <div className="relative inline-block shrink-0">
              <div className="h-20 w-20 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
                {values.profileImageUrl ? (
                   
                  <img src={values.profileImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-sam-meta">없음</div>
                )}
              </div>
              <input
                ref={profileFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadProfileImage(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => profileFileInputRef.current?.click()}
                className="absolute bottom-0 right-0 z-10 flex min-h-[44px] min-w-[44px] translate-x-1 translate-y-1 items-center justify-center border-0 bg-transparent p-0 shadow-none outline-none ring-0 hover:opacity-90 active:opacity-75 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-signature/40 focus-visible:ring-offset-1"
                aria-label={
                  values.profileImageUrl.trim()
                    ? "대표 이미지 등록됨, 파일 선택하여 교체"
                    : "대표 이미지 미등록, 파일 선택"
                }
              >
                <span
                  className="text-[24px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] sm:text-[28px]"
                  aria-hidden
                >
                  📷
                </span>
                <span className="sr-only">
                  {values.profileImageUrl.trim() ? "(등록)" : "(미등록)"}
                </span>
              </button>
            </div>
          </div>
          {uploading ? <p className="mt-1 text-[12px] text-sam-muted">업로드 중…</p> : null}
        </div>

        <div>
          <p className="mb-1 text-[14px] font-medium text-sam-fg">매장 이름</p>
          {identityEditable ? (
            <>
              <p className="mb-2 text-[12px] leading-relaxed text-sam-muted">
                관리자가 매장명·업종 수정을 허용한 상태입니다. 공개 매장 창에도 저장 후 동일하게 반영됩니다.
              </p>
              <input
                type="text"
                value={values.shopName}
                onChange={(e) => setValues((v) => ({ ...v, shopName: e.target.value }))}
                autoComplete="organization"
                className={OWNER_STORE_CONTROL_CLASS}
              />
            </>
          ) : (
            <>
              <p className="mb-1 text-[12px] leading-relaxed text-sam-muted">
                DB·매장 창·관리자 심사와 동일한 이름입니다. 변경이 필요하면 운영·관리자에게 문의해 주세요.
              </p>
              <p className="text-[16px] font-semibold text-sam-fg">
                {(row.store_name ?? "").trim() || "—"}
              </p>
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[14px] font-medium text-sam-fg">매장 소개</label>
          <textarea
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            rows={4}
            className={OWNER_STORE_CONTROL_CLASS}
            placeholder="공개 페이지 소개 영역에 표시됩니다."
          />
        </div>

        <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
          <div className="min-w-0">
            <label className="mb-1 block text-[14px] font-medium text-sam-fg">전화번호</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={formatPhMobileDisplay(values.phone)}
              onChange={(e) => setValues((v) => ({ ...v, phone: parsePhMobileInput(e.target.value) }))}
              className={OWNER_STORE_CONTROL_CLASS}
              placeholder={PH_LOCAL_09_PLACEHOLDER}
            />
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-[14px] font-medium text-sam-fg">카카오톡 ID (선택)</label>
            <input
              type="text"
              value={values.kakaoId}
              onChange={(e) => setValues((v) => ({ ...v, kakaoId: e.target.value }))}
              className={OWNER_STORE_CONTROL_CLASS}
              placeholder="연락 가능한 카카오 ID"
            />
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-[14px] font-medium text-sam-fg">GCash no. (선택)</label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={formatPhMobileDisplay(values.email)}
              onChange={(e) => setValues((v) => ({ ...v, email: parsePhMobileInput(e.target.value) }))}
              className={OWNER_STORE_CONTROL_CLASS}
              placeholder={PH_LOCAL_09_PLACEHOLDER}
              title={PH_LOCAL_09_PLACEHOLDER}
            />
          </div>

          <div className="min-w-0">
            <label className="mb-1 block text-[14px] font-medium text-sam-fg">GCash name (선택)</label>
            <input
              type="text"
              autoComplete="name"
              value={values.websiteUrl}
              onChange={(e) => setValues((v) => ({ ...v, websiteUrl: e.target.value }))}
              className={OWNER_STORE_CONTROL_CLASS}
              placeholder="계정 표시 이름"
            />
          </div>
        </div>

        <StoreAddressLocationSection
          sectionHint={STORE_LOCATION_SECTION_HINT_STORE_PUBLIC}
          regionId={regionId}
          cityId={cityId}
          onRegionChange={(id) => {
            setRegionId(id);
            setCityId("");
          }}
          onCityChange={(id) => {
            setCityId(id);
          }}
          addressStreetLine={values.addressStreetLine}
          addressDetail={values.addressDetail}
          onAddressStreetLineChange={(v) =>
            setValues((x) => ({ ...x, addressStreetLine: v }))
          }
          onAddressDetailChange={(v) => setValues((x) => ({ ...x, addressDetail: v }))}
          showRequired={false}
        />

        <div className="space-y-2">
          <h3 className="text-[14px] font-semibold text-sam-fg">업종 · 세부 주제</h3>
          {identityEditable ? (
            <p className="text-[12px] leading-relaxed text-sam-muted">
              관리자 허용 상태입니다. 저장 시 DB·공개 매장 창에 반영됩니다.
            </p>
          ) : null}
          {taxonomyLoading ? (
            <p className="text-[13px] text-sam-muted">분류 목록 불러오는 중…</p>
          ) : identityEditable && useDbTaxonomy ? (
            <div className={`mt-2 ${OWNER_STORE_FORM_GRID_2_CLASS}`}>
              <div className="min-w-0">
                <label className="mb-1 block text-[13px] font-medium text-sam-fg">1차 업종</label>
                <select
                  value={storeCategoryId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setStoreCategoryId(id);
                    const first = taxonomy!.topics.find((t) => t.store_category_id === id);
                    setStoreTopicId(first?.id ?? "");
                  }}
                  className={OWNER_STORE_SELECT_CLASS}
                >
                  {taxonomy!.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[13px] font-medium text-sam-fg">세부 주제</label>
                <select
                  value={storeTopicId}
                  onChange={(e) => setStoreTopicId(e.target.value)}
                  disabled={topicsForCategory.length === 0}
                  className={OWNER_STORE_SELECT_CLASS}
                >
                  {topicsForCategory.length === 0 ? (
                    <option value="">이 업종에 등록된 주제가 없습니다</option>
                  ) : (
                    topicsForCategory.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          ) : identityEditable && !useDbTaxonomy ? (
            <div className="mt-2 space-y-2">
              <p className="text-[12px] leading-relaxed text-amber-900">
                {taxonomyMeta?.source === "supabase_unconfigured" ? (
                  <>
                    Supabase 연결이 없어 DB 분류를 불러오지 못했습니다.{" "}
                    <code className="rounded bg-amber-100 px-1">.env</code>를 확인한 뒤 개발 서버를 다시 시작해
                    주세요.
                  </>
                ) : (
                  <>DB 분류를 쓸 수 없을 때는 아래 표시명(<code className="rounded bg-amber-100 px-1">business_type</code>)만 저장됩니다.</>
                )}
              </p>
              <label className="mb-1 block text-[13px] font-medium text-sam-fg">업종 (표시명)</label>
              <select
                value={values.category}
                onChange={(e) => setValues((v) => ({ ...v, category: e.target.value }))}
                className={OWNER_STORE_SELECT_CLASS}
              >
                {primaryIndustryNames.length === 0 ? (
                  <option value="기타">기타</option>
                ) : (
                  primaryIndustryNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : useDbTaxonomy ? (
            <div className="mt-2 space-y-3">
              <div>
                <p className="mb-0.5 text-[12px] font-medium text-sam-muted">1차 업종 (DB)</p>
                <p className="text-[15px] text-sam-fg">{storeEmbedName(row.store_categories) || "—"}</p>
              </div>
              <div>
                <p className="mb-0.5 text-[12px] font-medium text-sam-muted">세부 주제 (DB)</p>
                <p className="text-[15px] text-sam-fg">{storeEmbedName(row.store_topics) || "—"}</p>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-[12px] leading-relaxed text-amber-900">
                {taxonomyMeta?.source === "supabase_unconfigured" ? (
                  <>
                    Supabase 연결이 없어 DB 분류를 불러오지 못했습니다.{" "}
                    <code className="rounded bg-amber-100 px-1">.env</code>의 Supabase URL·키를 확인해 주세요.
                  </>
                ) : taxonomyMeta?.store_topics_table === "missing" ? (
                  <>
                    <code className="rounded bg-amber-100 px-1">store_topics</code> 테이블이 없습니다. 마이그레이션을
                    적용해 주세요.
                  </>
                ) : (
                  <>DB 분류를 불러오지 못했습니다. 아래는 DB의 업종 표기 필드입니다.</>
                )}
              </p>
              <p className="mb-0.5 text-[12px] font-medium text-sam-muted">업종 표기 (business_type)</p>
              <p className="text-[15px] text-sam-fg">{(row.business_type || "—").trim() || "—"}</p>
            </div>
          )}
        </div>
      </form>

      {dockAboveBottomNav ? (
        <div
          className={`pointer-events-auto fixed inset-x-0 z-30 ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS} ${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} box-border w-full min-w-0 max-w-full bg-sam-surface`}
        >
          {actionBarInner}
        </div>
      ) : (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
          <div
            className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} pointer-events-auto box-border w-full min-w-0 max-w-full`}
          >
            {actionBarInner}
          </div>
        </div>
      )}
    </>
  );
}
