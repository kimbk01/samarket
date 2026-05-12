"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isProfileEditPath } from "@/lib/mypage/mypage-mobile-nav-registry";
import { PH_LOCAL_09_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import {
  formatPhMobileDisplay0956,
  normalizePhMobileDb,
  parsePhMobileInput,
} from "@/lib/utils/ph-mobile";
import { REGIONS } from "@/lib/products/form-options";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { deriveStoreAddressFieldsFromUserAddressMaster } from "@/lib/business/derive-store-address-from-user-address-master";
import { OwnerAddressBookSnapshotCard } from "@/components/business/OwnerAddressBookSnapshotCard";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { StoreAddressLocationSection } from "@/components/stores/StoreAddressLocationSection";
import { splitStoreDescriptionAndKakao } from "@/lib/stores/split-store-description-kakao";
import {
  OWNER_STORE_CONTROL_CLASS,
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_SELECT_CLASS,
} from "@/lib/business/owner-store-stack";
import { listBrowsePrimaryIndustries } from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import {
  BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS,
  BOTTOM_NAV_SHELL,
} from "@/lib/main-menu/bottom-nav-config";
import {
  OWNER_BASIC_INFO_LEAVE_EVENT,
  setOwnerBasicInfoDirty,
  type OwnerBasicInfoLeaveDetail,
} from "@/lib/business/owner-basic-info-guard";
import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { STORE_LOCATION_SECTION_HINT_STORE_PUBLIC } from "@/lib/stores/store-address-form-ui";
import { fetchStoresTaxonomyDeduped } from "@/lib/stores/store-delivery-api-client";
import {
  parseFiniteLatitude,
  parseFiniteLongitude,
} from "@/lib/geo/parse-finite-geographic-coord";
import {
  formatStoreAddressDetailOnly,
  formatStoreAddressStreetDisplay,
} from "@/lib/stores/store-location-label";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerStoreAdminLeavePromptModal } from "@/components/business/owner/OwnerStoreAdminLeavePromptModal";

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

function deriveStoreTopicIdsFromRow(
  row: StoreRow,
  taxonomy: { categories: StoreTaxonomyCategory[]; topics: StoreTaxonomyTopic[] } | null
): { categoryId: string; topicId: string } {
  if (!taxonomy?.categories.length) {
    return { categoryId: "", topicId: "" };
  }
  const fromRowCat = row.store_category_id?.trim() ?? "";
  const fromRowTopic = row.store_topic_id?.trim() ?? "";
  if (fromRowCat && taxonomy.categories.some((c) => c.id === fromRowCat)) {
    if (fromRowTopic && taxonomy.topics.some((t) => t.id === fromRowTopic)) {
      return { categoryId: fromRowCat, topicId: fromRowTopic };
    }
    const first = taxonomy.topics.find((t) => t.store_category_id === fromRowCat);
    return { categoryId: fromRowCat, topicId: first?.id ?? "" };
  }
  const legacyName = (row.business_type ?? "").trim();
  const match = legacyName ? taxonomy.categories.find((c) => c.name === legacyName) : undefined;
  if (match) {
    const firstT = taxonomy.topics.find((t) => t.store_category_id === match.id);
    return { categoryId: match.id, topicId: firstT?.id ?? "" };
  }
  const firstCat = taxonomy.categories[0]!;
  const firstT = taxonomy.topics.find((t) => t.store_category_id === firstCat.id);
  return { categoryId: firstCat.id, topicId: firstT?.id ?? "" };
}

function serializeFormSnapshot(input: {
  values: BasicValues;
  regionId: string;
  cityId: string;
  storeCategoryId: string;
  storeTopicId: string;
  identityEditable: boolean;
  useDbTaxonomy: boolean;
}): string {
  const { values, regionId, cityId, storeCategoryId, storeTopicId, identityEditable, useDbTaxonomy } =
    input;
  const phoneDigits = parsePhMobileInput(values.phone);
  const emailDigits = parsePhMobileInput(values.email);
  const payload = {
    shopName: identityEditable ? values.shopName.trim() : "",
    description: values.description.trim(),
    phone: phoneDigits,
    kakaoId: values.kakaoId.trim(),
    email: emailDigits,
    websiteUrl: values.websiteUrl.trim(),
    profileImageUrl: values.profileImageUrl.trim(),
    addressStreetLine: values.addressStreetLine.trim(),
    addressDetail: values.addressDetail.trim(),
    category: values.category.trim(),
    regionId: regionId.trim(),
    cityId: cityId.trim(),
    storeCategoryId: identityEditable && useDbTaxonomy ? storeCategoryId.trim() : "",
    storeTopicId: identityEditable && useDbTaxonomy ? storeTopicId.trim() : "",
  };
  return JSON.stringify(payload);
}

function rowToBasicValues(row: StoreRow): BasicValues {
  const { intro, kakao } = splitStoreDescriptionAndKakao(row.description, row.kakao_id ?? null);
  const street = formatStoreAddressStreetDisplay({
    district: row.district,
    address_line1: row.address_line1,
    address_line2: row.address_line2,
  });
  const detail = formatStoreAddressDetailOnly(row.address_line2);
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
    invalid_store_topic_id: "2차 업종 (세부) 값이 올바르지 않습니다. 다시 선택해 주세요.",
    store_topic_not_found: "선택한 2차 업종 (세부)을 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 선택해 주세요.",
    store_topic_category_mismatch: "2차 업종 (세부)이 선택한 1차 업종과 맞지 않습니다. 다시 맞춰 주세요.",
    store_name_too_short: "매장 이름은 2자 이상 입력해 주세요.",
  };
  return m[code] ?? null;
}

export type OwnerStoreBasicInfoFormProps = {
  storeId: string;
  row: StoreRow;
  onSaved: () => void;
};

export function OwnerStoreBasicInfoForm({
  storeId,
  row,
  onSaved,
}: OwnerStoreBasicInfoFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const hideAppBottomNav =
    (pathname?.startsWith("/my/settings") ?? false) ||
    pathname === "/my/logout" ||
    isProfileEditPath(pathname);
  const shellFlags = useMemo(
    () => resolveConditionalAppShellFlags(pathname ?? "", false),
    [pathname]
  );
  /** 메인 앱 BottomNav(1000) 바로 위에 두기 — `/stores/owner/*` 세부는 탭이 꺼져 있어 보통 false */
  const dockActionBarAboveMainBottomNav =
    !hideAppBottomNav && shellFlags.showBottomNav;

  const industryVersion = useBrowseIndustryDatasetVersion();
  const identityEditable = row.owner_can_edit_store_identity === true;
  const primaryIndustryNames = useMemo(
    () => listBrowsePrimaryIndustries().map((p) => p.nameKo),
    [industryVersion]
  );

  const saveConfirmDescription = useMemo(
    () =>
      identityEditable
        ? "기본 정보(로고·매장명·소개·연락처·위치·상세 주소·업종 등)를 저장합니다. 계속할까요?"
        : "로고·소개·연락처·위치·상세 주소만 저장합니다. 매장 이름·1차·2차 업종은 DB에 고정되어 있으며, 관리자가 허용한 경우에만 수정할 수 있습니다. 계속할까요?",
    [identityEditable]
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
  /** 매장 `lat`/`lng` 직접 보정 — delivery-eta·Routes 용 */
  const [manualMapLat, setManualMapLat] = useState("");
  const [manualMapLng, setManualMapLng] = useState("");
  const profileFileInputRef = useRef<HTMLInputElement>(null);
  const [addressDefault, setAddressDefault] = useState<UserAddressDTO | null>(null);
  const [addressReady, setAddressReady] = useState(false);
  const addressLoadSeqRef = useRef(0);

  const useDbTaxonomy = Boolean(
    taxonomy && taxonomy.categories.length > 0 && taxonomy.topics.length > 0
  );

  const storeMapCoordsOk = useMemo(
    () => parseFiniteLatitude(row.lat) != null && parseFiniteLongitude(row.lng) != null,
    [row.lat, row.lng]
  );

  const topicsForCategory = useMemo(() => {
    if (!storeCategoryId || !taxonomy?.topics.length) return [];
    return taxonomy.topics.filter((t) => t.store_category_id === storeCategoryId);
  }, [taxonomy, storeCategoryId]);

  const liveFormSnapRef = useRef({
    values,
    regionId,
    cityId,
    storeCategoryId,
    storeTopicId,
    identityEditable,
    useDbTaxonomy,
  });
  liveFormSnapRef.current = {
    values,
    regionId,
    cityId,
    storeCategoryId,
    storeTopicId,
    identityEditable,
    useDbTaxonomy,
  };

  const [baselineSnapshot, setBaselineSnapshot] = useState<string | null>(null);
  const [leavePrompt, setLeavePrompt] = useState<OwnerBasicInfoLeaveDetail | null>(null);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  const isDirty =
    baselineSnapshot != null &&
    serializeFormSnapshot(liveFormSnapRef.current) !== baselineSnapshot;

  useEffect(() => {
    setOwnerBasicInfoDirty(isDirty);
    return () => setOwnerBasicInfoDirty(false);
  }, [isDirty]);

  useEffect(() => {
    const onLeave = (ev: Event) => {
      const detail = (ev as CustomEvent<OwnerBasicInfoLeaveDetail>).detail;
      if (detail?.href) setLeavePrompt(detail);
    };
    window.addEventListener(OWNER_BASIC_INFO_LEAVE_EVENT, onLeave);
    return () => window.removeEventListener(OWNER_BASIC_INFO_LEAVE_EVENT, onLeave);
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [isDirty]);

  useEffect(() => {
    if (!identityEditable) return;
    if (taxonomy && taxonomy.categories.length > 0 && taxonomy.topics.length > 0) return;
    if (primaryIndustryNames.length === 0) return;
    setValues((v) =>
      primaryIndustryNames.includes(v.category) ? v : { ...v, category: primaryIndustryNames[0]! }
    );
  }, [primaryIndustryNames, taxonomy, identityEditable]);

  useEffect(() => {
    const la = parseFiniteLatitude(row.lat);
    const ln = parseFiniteLongitude(row.lng);
    setManualMapLat(la != null ? String(la) : "");
    setManualMapLng(ln != null ? String(ln) : "");
  }, [row.id, row.lat, row.lng]);

  useEffect(() => {
    let cancelled = false;
    setTaxonomyLoading(true);
    void (async () => {
      try {
        const { json: jRaw } = await fetchStoresTaxonomyDeduped();
        const j = jRaw as {
          meta?: unknown;
          ok?: boolean;
          categories?: unknown;
          topics?: unknown;
        };
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
    const derived = deriveStoreTopicIdsFromRow(row, taxonomy);
    setStoreCategoryId(derived.categoryId);
    setStoreTopicId(derived.topicId);
  }, [row, taxonomy]);

  useEffect(() => {
    setValues(rowToBasicValues(row));
    const { rid, cid } = resolveRegionCityIds(row.region ?? "", row.city ?? "");
    setRegionId(rid);
    setCityId(cid);
  }, [row]);

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
        const master = (snap?.ok && snap.defaults ? (snap.defaults.master as UserAddressDTO | null) : null) ?? null;
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

  useEffect(() => {
    if (!addressReady || taxonomyLoading) return;
    const id = requestAnimationFrame(() => {
      setBaselineSnapshot(serializeFormSnapshot(liveFormSnapRef.current));
    });
    return () => cancelAnimationFrame(id);
  }, [row, addressReady, taxonomyLoading, taxonomy]);

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

  const revertToSaved = useCallback(() => {
    setError(null);
    const nextValues = rowToBasicValues(row);
    setValues(nextValues);
    const { rid, cid } = resolveRegionCityIds(row.region ?? "", row.city ?? "");
    setRegionId(rid);
    setCityId(cid);
    const derived = deriveStoreTopicIdsFromRow(row, taxonomy);
    setStoreCategoryId(derived.categoryId);
    setStoreTopicId(derived.topicId);
    setBaselineSnapshot(
      serializeFormSnapshot({
        values: nextValues,
        regionId: rid,
        cityId: cid,
        storeCategoryId: derived.categoryId,
        storeTopicId: derived.topicId,
        identityEditable,
        useDbTaxonomy,
      })
    );
  }, [row, taxonomy, identityEditable, useDbTaxonomy]);

  const runSave = async (options?: { skipPrompt?: boolean }): Promise<boolean> => {
    setError(null);
    const phoneDigits = parsePhMobileInput(values.phone);
    const phoneDb = phoneDigits ? normalizePhMobileDb(phoneDigits) : null;
    if (phoneDigits && !phoneDb) {
      setError("전화번호를 09 xx xxx xxxx 형식(11자리)으로 입력해 주세요.");
      return false;
    }
    const gcashDb = normalizePhMobileDb(values.email);
    if (identityEditable) {
      const name = values.shopName.trim();
      if (name.length < 2) {
        setError("매장 이름은 2자 이상 입력해 주세요.");
        return false;
      }
      if (
        useDbTaxonomy &&
        storeCategoryId &&
        topicsForCategory.length > 0 &&
        !storeTopicId.trim()
      ) {
        setError("2차 업종 (세부)를 선택해 주세요.");
        return false;
      }
    }
    if (!options?.skipPrompt) {
      setSaveConfirmOpen(true);
      return false;
    }
    setSubmitting(true);
    try {
      const r = REGIONS.find((x) => x.id === regionId.trim());
      const c = r?.cities.find((x) => x.id === cityId.trim());
      const regionName = (r?.name ?? row.region ?? "").trim() || null;
      const cityName = (c?.name ?? row.city ?? "").trim() || null;

      /** 매장 설정(영업시간·갤러리 등) 필드는 보내지 않음 — 이 화면 전용 PATCH */
      const basicInfoPatch: Record<string, unknown> = {
        description: values.description.trim() || null,
        phone: phoneDb,
        kakao_id: values.kakaoId.trim() || null,
        region: regionName,
        city: cityName,
        district: values.addressStreetLine.trim() || null,
        address_line1: values.addressStreetLine.trim() || null,
        address_line2: values.addressDetail.trim() || null,
        email: gcashDb,
        website_url: values.websiteUrl.trim() || null,
        profile_image_url: values.profileImageUrl.trim() || null,
      };
      const ml = manualMapLat.trim();
      const mn = manualMapLng.trim();
      let resolvedLat: number | null = null;
      let resolvedLng: number | null = null;
      if (ml || mn) {
        if (!ml || !mn) {
          setError("지도 좌표는 위도·경도를 함께 입력하거나 둘 다 비워 두세요.");
          setSubmitting(false);
          return false;
        }
        const la = parseFiniteLatitude(ml);
        const ln = parseFiniteLongitude(mn);
        if (la == null || ln == null) {
          setError("위도(-90~90)·경도(-180~180) 숫자 형식을 확인해 주세요.");
          setSubmitting(false);
          return false;
        }
        resolvedLat = la;
        resolvedLng = ln;
      } else if (addressDefault?.id) {
        /** 수동 좌표 비움: 카드 거리·ETA가 주소록과 어긋나지 않도록 대표 주소록 핀을 매장 좌표로 동기화 */
        const dlat = parseFiniteLatitude(addressDefault.latitude);
        const dlng = parseFiniteLongitude(addressDefault.longitude);
        if (dlat != null && dlng != null) {
          resolvedLat = dlat;
          resolvedLng = dlng;
        }
      }
      if (resolvedLat != null && resolvedLng != null) {
        basicInfoPatch.lat = resolvedLat;
        basicInfoPatch.lng = resolvedLng;
      }
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
        return false;
      }
      if (!j?.ok || !j?.store) {
        const code = typeof j?.error === "string" ? j.error : "";
        setError(
          code === "invalid_ph_phone"
            ? "전화번호를 09 xx xxx xxxx 형식(11자리)으로 입력해 주세요."
            : patchErrorToUserMessage(code) ?? (code ? code : "저장에 실패했습니다.")
        );
        return false;
      }
      onSaved();
      return true;
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const saveBasicInfo = async () => {
    await runSave();
  };

  const confirmLeaveWithSave = async () => {
    if (!leavePrompt) return;
    setLeaveSaving(true);
    try {
      const ok = await runSave({ skipPrompt: true });
      if (ok) {
        const href = leavePrompt.href;
        setLeavePrompt(null);
        router.push(href);
      }
    } finally {
      setLeaveSaving(false);
    }
  };

  /** 모달 «취소»: 편집 폐기 후 뒤로/사이드바가 요청한 경로로 이동 */
  const confirmLeaveDiscard = useCallback(() => {
    if (!leavePrompt) return;
    const href = leavePrompt.href;
    setLeavePrompt(null);
    revertToSaved();
    router.push(href);
  }, [leavePrompt, revertToSaved, router]);

  return (
    <>
      <form
        id="owner-store-basic-info-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void saveBasicInfo();
        }}
        className={`max-w-full min-w-0 space-y-3 sm:space-y-4 ${
          isDirty
            ? "pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]"
            : "pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:pb-3"
        }`}
      >
        <OwnerStoreAdminDashSection title="공개 브랜딩">
        <div>
          <label className="mb-2 block sam-text-body-secondary font-bold text-sam-fg">대표 이미지 (로고)</label>
          <div>
            <div className="relative inline-block shrink-0">
              <div className="h-20 w-20 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
                {values.profileImageUrl ? (
                  <img src={values.profileImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center sam-text-xxs text-sam-meta">없음</div>
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
                  className="sam-text-hero leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] sm:sam-text-hero"
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
          {uploading ? <p className="mt-1 sam-text-helper text-sam-muted">업로드 중…</p> : null}
        </div>

        <div>
          <p className="mb-1 block sam-text-body-secondary font-bold text-sam-fg">매장 이름</p>
          <div className="mb-2 rounded-ui-rect border border-signature/25 bg-signature/5 px-2.5 py-2">
            <p className="sam-text-xxs font-normal leading-snug text-signature">
              매장명 변경 시 dibaY 운영팀 문의 바랍니다.
            </p>
          </div>
          {identityEditable ? (
            <input
              type="text"
              value={values.shopName}
              onChange={(e) => setValues((v) => ({ ...v, shopName: e.target.value }))}
              autoComplete="organization"
              className={OWNER_STORE_CONTROL_CLASS}
            />
          ) : (
            <p className="sam-text-body-lg font-normal text-sam-fg">
              {(row.store_name ?? "").trim() || "—"}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block sam-text-body-secondary font-bold text-sam-fg">매장 소개</label>
          <textarea
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            rows={4}
            className={OWNER_STORE_CONTROL_CLASS}
            placeholder="공개 페이지 소개 영역에 표시됩니다."
          />
        </div>

        </OwnerStoreAdminDashSection>

        <OwnerStoreAdminDashSection title="연락처 · 결제 표기">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-app/30">
              <div className="border-b border-sam-border-soft bg-sam-app/70 px-3 py-2">
                <p className="sam-text-body-secondary font-bold text-sam-fg">연락처</p>
              </div>
              <div className="p-3 sm:p-4">
                <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
                  <div className="min-w-0">
                    <label className="mb-1 block sam-text-helper font-normal text-sam-muted">전화번호</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={formatPhMobileDisplay0956(values.phone)}
                      onChange={(e) => setValues((v) => ({ ...v, phone: parsePhMobileInput(e.target.value) }))}
                      className={OWNER_STORE_CONTROL_CLASS}
                      placeholder="0956 188 6313"
                    />
                  </div>

                  <div className="min-w-0">
                    <label className="mb-1 block sam-text-helper font-normal text-sam-muted">카카오톡 ID (선택)</label>
                    <input
                      type="text"
                      value={values.kakaoId}
                      onChange={(e) => setValues((v) => ({ ...v, kakaoId: e.target.value }))}
                      className={OWNER_STORE_CONTROL_CLASS}
                      placeholder="연락 가능한 카카오 ID"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-app/30">
              <div className="border-b border-sam-border-soft bg-sam-app/70 px-3 py-2">
                <p className="sam-text-body-secondary font-bold text-sam-fg">결제 표기</p>
              </div>
              <div className="p-3 sm:p-4">
                <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
                  <div className="min-w-0">
                    <label className="mb-1 block sam-text-helper font-normal text-sam-muted">GCash no. (선택)</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      value={formatPhMobileDisplay0956(values.email)}
                      onChange={(e) => setValues((v) => ({ ...v, email: parsePhMobileInput(e.target.value) }))}
                      className={OWNER_STORE_CONTROL_CLASS}
                      placeholder="0956 188 6313"
                      title={PH_LOCAL_09_PLACEHOLDER}
                    />
                  </div>

                  <div className="min-w-0">
                    <label className="mb-1 block sam-text-helper font-normal text-sam-muted">GCash name (선택)</label>
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
              </div>
            </div>
          </div>
        </OwnerStoreAdminDashSection>

        <OwnerStoreAdminDashSection title="매장 위치">
          <div className="space-y-4">
            {!storeMapCoordsOk ? (
              <div className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-3 py-2.5 sam-text-helper text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-semibold">좌표 미설정</p>
                <p className="mt-1 leading-relaxed">
                  배달 예상 시간·경로 거리는 매장의 지도 좌표(<code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">stores.lat</code> /{" "}
                  <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">lng</code>)가 있어야 계산됩니다. WGS84 위도·경도를 입력한 뒤
                  저장하세요.
                </p>
                <div className={`mt-3 ${OWNER_STORE_FORM_GRID_2_CLASS}`}>
                  <div className="min-w-0">
                    <label className="mb-1 block font-medium text-amber-900 dark:text-amber-50">위도 (lat)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={manualMapLat}
                      onChange={(e) => setManualMapLat(e.target.value)}
                      className={OWNER_STORE_CONTROL_CLASS}
                      placeholder="예: 14.5995"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block font-medium text-amber-900 dark:text-amber-50">경도 (lng)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={manualMapLng}
                      onChange={(e) => setManualMapLng(e.target.value)}
                      className={OWNER_STORE_CONTROL_CLASS}
                      placeholder="예: 120.9842"
                    />
                  </div>
                </div>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-app/30">
              <div className="border-b border-sam-border-soft bg-sam-app/70 px-3 py-2">
                <p className="sam-text-body-secondary font-bold text-sam-fg">주소록</p>
              </div>
              <div className="p-3 sm:p-4">
                <OwnerAddressBookSnapshotCard
                  bare
                  returnToPath={`/stores/owner/basic-info?storeId=${encodeURIComponent(storeId)}`}
                  addressReady={addressReady}
                  addressDefault={addressDefault}
                />
              </div>
            </div>

            {addressReady && !addressDefault?.id ? (
              <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-app/30">
                <div className="border-b border-sam-border-soft bg-sam-app/70 px-3 py-2">
                  <p className="sam-text-body-secondary font-bold text-sam-fg">직접 입력</p>
                </div>
                <div className="p-3 sm:p-4">
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
                    onAddressStreetLineChange={(v) => setValues((x) => ({ ...x, addressStreetLine: v }))}
                    onAddressDetailChange={(v) => setValues((x) => ({ ...x, addressDetail: v }))}
                    showRequired={false}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </OwnerStoreAdminDashSection>

        <OwnerStoreAdminDashSection title="업종 분류">
          {taxonomyLoading ? (
            <p className="sam-text-body-secondary text-sam-muted">분류 목록 불러오는 중…</p>
          ) : identityEditable && useDbTaxonomy ? (
            <div className={`mt-2 ${OWNER_STORE_FORM_GRID_2_CLASS}`}>
              <div className="min-w-0">
                <label className="mb-1 block sam-text-body-secondary font-bold text-sam-fg">1차 업종</label>
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
                <label className="mb-1 block sam-text-body-secondary font-bold text-sam-fg">2차 업종 (세부)</label>
                <select
                  value={storeTopicId}
                  onChange={(e) => setStoreTopicId(e.target.value)}
                  disabled={topicsForCategory.length === 0}
                  className={OWNER_STORE_SELECT_CLASS}
                >
                  {topicsForCategory.length === 0 ? (
                    <option value="">선택 가능한 2차 업종이 없습니다</option>
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
              <p className="sam-text-helper leading-relaxed text-amber-900">
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
              <label className="mb-1 block sam-text-body-secondary font-bold text-sam-fg">업종 (표시명)</label>
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
                <p className="mb-0.5 sam-text-body-secondary font-bold text-sam-fg">1차 업종</p>
                <p className="sam-text-body font-normal text-sam-fg">{storeEmbedName(row.store_categories) || "—"}</p>
              </div>
              <div>
                <p className="mb-0.5 sam-text-body-secondary font-bold text-sam-fg">2차 업종 (세부)</p>
                <p className="sam-text-body font-normal text-sam-fg">{storeEmbedName(row.store_topics) || "—"}</p>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="sam-text-helper leading-relaxed text-amber-900">
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
              <p className="mb-0.5 sam-text-body-secondary font-bold text-sam-fg">업종 표기 (business_type)</p>
              <p className="sam-text-body font-normal text-sam-fg">{(row.business_type || "—").trim() || "—"}</p>
            </div>
          )}
        </OwnerStoreAdminDashSection>
      </form>

      {isDirty ?
        <BodyPortal>
          <footer
            role="contentinfo"
            aria-label="기본 정보 저장"
            className={`pointer-events-none fixed inset-x-0 z-[54] border-t border-sam-border bg-sam-surface/95 backdrop-blur-md supports-[backdrop-filter]:bg-sam-surface/88 ${
              dockActionBarAboveMainBottomNav
                ? BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS
                : "bottom-0 pb-[env(safe-area-inset-bottom,0px)]"
            }`}
          >
            <div
              className={`${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS} pointer-events-auto mx-auto w-full min-w-0 max-w-full`}
            >
              {error ?
                <div
                  className="max-h-20 overflow-y-auto border-b border-red-100 bg-red-50 px-3 py-1.5 sam-text-xxs leading-snug text-red-800"
                  role="alert"
                >
                  {error}
                </div>
              : null}
              <div className="flex min-w-0 divide-x divide-sam-border">
                <button
                  type="button"
                  onClick={revertToSaved}
                  disabled={submitting || uploading || leaveSaving || saveConfirmOpen}
                  className={`${BOTTOM_NAV_SHELL.heightClass} min-w-0 flex-1 rounded-none border-0 bg-sam-surface px-2 sam-text-body font-medium text-signature disabled:opacity-50`}
                >
                  취소
                </button>
                <button
                  type="submit"
                  form="owner-store-basic-info-form"
                  disabled={submitting || uploading || leaveSaving || saveConfirmOpen}
                  className={`${BOTTOM_NAV_SHELL.heightClass} min-w-0 flex-1 rounded-none border-0 bg-signature px-2 sam-text-body font-medium text-white disabled:opacity-50`}
                >
                  {submitting ? "저장 중…" : "저장"}
                </button>
              </div>
            </div>
          </footer>
        </BodyPortal>
      : null}

      <OwnerStoreAdminConfirmModal
        open={saveConfirmOpen}
        titleId="owner-basic-info-save-confirm-title"
        title="기본 정보 저장"
        description={saveConfirmDescription}
        cancelLabel="취소"
        confirmLabel="저장"
        confirmBusyLabel="저장 중…"
        busy={submitting}
        disableActions={submitting || uploading || leaveSaving}
        confirmTone="primary"
        onCancel={() => setSaveConfirmOpen(false)}
        onConfirm={async () => {
          setSaveConfirmOpen(false);
          await runSave({ skipPrompt: true });
        }}
      />

      <OwnerStoreAdminLeavePromptModal
        open={leavePrompt != null}
        titleId="owner-basic-info-leave-title"
        leaveSaving={leaveSaving}
        disableActions={leaveSaving || submitting || uploading}
        onDiscard={confirmLeaveDiscard}
        onConfirmSave={confirmLeaveWithSave}
      />
    </>
  );
}
