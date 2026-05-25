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
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  describeMeAddressesListFailure,
  fetchMeAddressesListSingleFlight,
  invalidateMeAddressesListClientCache,
  readCachedMeAddressList,
  writeCachedMeAddressList,
} from "@/lib/addresses/address-list-client-cache";
import {
  cancelOwnerHubSecondaryFetchKey,
  runNowOrScheduleOnStoreOwnerAdmin,
} from "@/lib/business/owner-hub-secondary-fetch-queue";
import { deriveStoreAddressFieldsFromUserAddressMaster } from "@/lib/business/derive-store-address-from-user-address-master";
import { pickUserAddressLinkedToStore } from "@/lib/business/pick-user-address-linked-to-store";
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
import { OWNER_STORE_ADMIN_FOOTER_BAR_CLASS } from "@/lib/business/owner-compact-shell-layout";
import { OWNER_DESKTOP_SHELL_MIN_TW } from "@/lib/business/owner-compact-shell-viewport";
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
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  formatOwnerStoreImageUploadError,
  formatOwnerStorePatchError,
} from "@/lib/business/owner-store-patch-error-i18n";

function resolveRegionCityIds(regionRaw: string, cityRaw: string): { rid: string; cid: string } {
  const rn = regionRaw.trim();
  const cn = cityRaw.trim();
  const r = REGIONS.find((x) => x.id === rn) ?? REGIONS.find((x) => x.name === rn);
  if (!r) return { rid: "", cid: "" };
  const c = r.cities.find((x) => x.id === cn) ?? r.cities.find((x) => x.name === cn);
  return { rid: r.id, cid: c?.id ?? "" };
}

/** 더티 판정 — 주소록 매장 행 좌표만 바뀐 경우도 잡는다 */
function storeLinkedGeoFingerprint(addr: UserAddressDTO | null): string {
  if (!addr?.id) return "";
  const la = addr.latitude;
  const ln = addr.longitude;
  const lat = typeof la === "number" && Number.isFinite(la) ? String(la) : "";
  const lng = typeof ln === "number" && Number.isFinite(ln) ? String(ln) : "";
  return `${addr.id}|${lat}|${lng}|${(addr.updatedAt ?? "").trim()}`;
}

type BasicValues = {
  shopName: string;
  description: string;
  phone: string;
  kakaoId: string;
  email: string;
  websiteUrl: string;
  profileImageUrl: string;
  /** 공개 메뉴판에서 품절을 섹션 하단으로 정렬 */
  menuSoldOutBottom: boolean;
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
  manualMapLat: string;
  manualMapLng: string;
  storeLinkedGeoFingerprint: string;
}): string {
  const {
    values,
    regionId,
    cityId,
    storeCategoryId,
    storeTopicId,
    identityEditable,
    useDbTaxonomy,
    manualMapLat,
    manualMapLng,
    storeLinkedGeoFingerprint,
  } = input;
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
    menuSoldOutBottom: values.menuSoldOutBottom,
    addressStreetLine: values.addressStreetLine.trim(),
    addressDetail: values.addressDetail.trim(),
    category: values.category.trim(),
    regionId: regionId.trim(),
    cityId: cityId.trim(),
    storeCategoryId: identityEditable && useDbTaxonomy ? storeCategoryId.trim() : "",
    storeTopicId: identityEditable && useDbTaxonomy ? storeTopicId.trim() : "",
    manualMapLat: manualMapLat.trim(),
    manualMapLng: manualMapLng.trim(),
    storeLinkedGeoFingerprint: storeLinkedGeoFingerprint.trim(),
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
    menuSoldOutBottom: row.menu_sold_out_bottom === true,
    addressStreetLine: street,
    addressDetail: detail,
    category: row.business_type ?? "",
  };
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
  const { t, language } = useI18n();
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
  const [storeLinkedUserAddress, setStoreLinkedUserAddress] = useState<UserAddressDTO | null>(null);
  const [addressReady, setAddressReady] = useState(false);
  const [addressBookListError, setAddressBookListError] = useState<string | null>(null);
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
    manualMapLat,
    manualMapLng,
    storeLinkedGeoFingerprint: storeLinkedGeoFingerprint(storeLinkedUserAddress),
  });
  liveFormSnapRef.current = {
    values,
    regionId,
    cityId,
    storeCategoryId,
    storeTopicId,
    identityEditable,
    useDbTaxonomy,
    manualMapLat,
    manualMapLng,
    storeLinkedGeoFingerprint: storeLinkedGeoFingerprint(storeLinkedUserAddress),
  };

  const [baselineSnapshot, setBaselineSnapshot] = useState<string | null>(null);
  const [leavePrompt, setLeavePrompt] = useState<OwnerBasicInfoLeaveDetail | null>(null);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  const isDirty =
    baselineSnapshot != null &&
    serializeFormSnapshot(liveFormSnapRef.current) !== baselineSnapshot;

  const savedRegionCity = useMemo(
    () => resolveRegionCityIds(row.region ?? "", row.city ?? ""),
    [row.region, row.city],
  );

  const storeAddressWillChange = useMemo(() => {
    const saved = rowToBasicValues(row);
    const savedLat = parseFiniteLatitude(row.lat);
    const savedLng = parseFiniteLongitude(row.lng);
    const nextLat = manualMapLat.trim() ? parseFiniteLatitude(manualMapLat) : null;
    const nextLng = manualMapLng.trim() ? parseFiniteLongitude(manualMapLng) : null;
    const linkedLat = storeLinkedUserAddress ? parseFiniteLatitude(storeLinkedUserAddress.latitude) : null;
    const linkedLng = storeLinkedUserAddress ? parseFiniteLongitude(storeLinkedUserAddress.longitude) : null;
    const manualEmpty = !manualMapLat.trim() && !manualMapLng.trim();
    const linkedPinDiffersFromStore =
      manualEmpty &&
      linkedLat != null &&
      linkedLng != null &&
      savedLat != null &&
      savedLng != null &&
      (linkedLat !== savedLat || linkedLng !== savedLng);
    return (
      values.addressStreetLine.trim() !== saved.addressStreetLine.trim() ||
      values.addressDetail.trim() !== saved.addressDetail.trim() ||
      regionId.trim() !== savedRegionCity.rid ||
      cityId.trim() !== savedRegionCity.cid ||
      nextLat !== savedLat ||
      nextLng !== savedLng ||
      linkedPinDiffersFromStore
    );
  }, [
    row,
    values.addressStreetLine,
    values.addressDetail,
    regionId,
    cityId,
    savedRegionCity,
    manualMapLat,
    manualMapLng,
    storeLinkedUserAddress,
  ]);

  const saveConfirmDescription = useMemo(() => {
    const base = identityEditable
      ? t("business_phase7_527")
      : t("business_phase7_528");
    const addressNotice = storeAddressWillChange ? t("business_phase7_529") : "";
    return `${base}${addressNotice} ${t("business_phase7_530")}`.trim();
  }, [identityEditable, storeAddressWillChange, t]);

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
    const loadTaxonomy = async () => {
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
    };
    runNowOrScheduleOnStoreOwnerAdmin(loadTaxonomy, 480, "owner-basic-info-taxonomy");
    return () => {
      cancelled = true;
      cancelOwnerHubSecondaryFetchKey("owner-basic-info-taxonomy");
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

  /** DB `row` 갱신 직후에도 주소록 매장 연결 행이 있으면 그 지역·가로줄을 다시 덮어쓴다 */
  useEffect(() => {
    if (!storeLinkedUserAddress?.id) return;
    const derived = deriveStoreAddressFieldsFromUserAddressMaster(storeLinkedUserAddress);
    if (!derived) return;
    setRegionId(derived.regionId);
    setCityId(derived.cityId);
    setValues((v) => ({
      ...v,
      addressStreetLine: derived.addressStreetLine || v.addressStreetLine,
      addressDetail: derived.addressDetail || v.addressDetail,
    }));
  }, [row, storeLinkedUserAddress]);

  useEffect(() => {
    let cancelled = false;
    let focusDebounce: number | null = null;
    const applyRows = (rows: UserAddressDTO[]) => {
      const linked = pickUserAddressLinkedToStore(storeId, rows);
      setStoreLinkedUserAddress(linked);
    };

    const load = async (opts?: { force?: boolean }) => {
      const seq = ++addressLoadSeqRef.current;
      if (!opts?.force) {
        const cached = readCachedMeAddressList();
        if (cached && cached.length > 0) {
          setAddressBookListError(null);
          applyRows(cached);
          setAddressReady(true);
        }
      } else {
        setAddressReady(false);
      }
      setAddressBookListError(null);
      if (opts?.force) {
        invalidateMeAddressesListClientCache();
      }
      try {
        const listResult = await fetchMeAddressesListSingleFlight();
        if (cancelled || seq !== addressLoadSeqRef.current) return;
        if (!listResult.ok) {
          setAddressBookListError(
            describeMeAddressesListFailure(listResult, t("business_phase7_514")),
          );
          setStoreLinkedUserAddress(null);
        } else {
          setAddressBookListError(null);
          if (listResult.rows.length > 0) writeCachedMeAddressList(listResult.rows);
          applyRows(listResult.rows);
        }
      } catch {
        if (!cancelled && seq === addressLoadSeqRef.current) {
          setStoreLinkedUserAddress(null);
          setAddressBookListError(t("business_phase7_514"));
        }
      } finally {
        if (!cancelled && seq === addressLoadSeqRef.current) setAddressReady(true);
      }
    };

    void load({ force: false });
    const onFocus = () => {
      if (focusDebounce != null) window.clearTimeout(focusDebounce);
      focusDebounce = window.setTimeout(() => {
        focusDebounce = null;
        void load({ force: true });
      }, 450);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load({ force: true });
    };
    const onAddressUpdated = () => void load({ force: true });
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressUpdated);
    return () => {
      cancelled = true;
      if (focusDebounce != null) window.clearTimeout(focusDebounce);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressUpdated);
    };
  }, [storeId]);

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
        setError(formatOwnerStoreImageUploadError(j, language));
        return;
      }
      setValues((v) => ({ ...v, profileImageUrl: j.url as string }));
    } catch {
      setError(t("business_phase7_521"));
    } finally {
      setUploading(false);
    }
  };

  const revertToSaved = useCallback(() => {
    setError(null);
    const nextValues = rowToBasicValues(row);
    const { rid, cid } = resolveRegionCityIds(row.region ?? "", row.city ?? "");
    let mergedValues = nextValues;
    let mergedRid = rid;
    let mergedCid = cid;
    if (storeLinkedUserAddress?.id) {
      const d = deriveStoreAddressFieldsFromUserAddressMaster(storeLinkedUserAddress);
      if (d) {
        mergedRid = d.regionId;
        mergedCid = d.cityId;
        mergedValues = {
          ...nextValues,
          addressStreetLine: d.addressStreetLine || nextValues.addressStreetLine,
          addressDetail: d.addressDetail || nextValues.addressDetail,
        };
      }
    }
    setValues(mergedValues);
    setRegionId(mergedRid);
    setCityId(mergedCid);
    const derived = deriveStoreTopicIdsFromRow(row, taxonomy);
    setStoreCategoryId(derived.categoryId);
    setStoreTopicId(derived.topicId);
    const la = parseFiniteLatitude(row.lat);
    const ln = parseFiniteLongitude(row.lng);
    const nextManualLat = la != null ? String(la) : "";
    const nextManualLng = ln != null ? String(ln) : "";
    setManualMapLat(nextManualLat);
    setManualMapLng(nextManualLng);
    setBaselineSnapshot(
      serializeFormSnapshot({
        values: mergedValues,
        regionId: mergedRid,
        cityId: mergedCid,
        storeCategoryId: derived.categoryId,
        storeTopicId: derived.topicId,
        identityEditable,
        useDbTaxonomy,
        manualMapLat: nextManualLat,
        manualMapLng: nextManualLng,
        storeLinkedGeoFingerprint: storeLinkedGeoFingerprint(storeLinkedUserAddress),
      }),
    );
  }, [row, taxonomy, identityEditable, useDbTaxonomy, storeLinkedUserAddress]);

  const runSave = async (options?: { skipPrompt?: boolean }): Promise<boolean> => {
    setError(null);
    const phoneDigits = parsePhMobileInput(values.phone);
    const phoneDb = phoneDigits ? normalizePhMobileDb(phoneDigits) : null;
    if (phoneDigits && !phoneDb) {
      setError(t("business_phase7_499"));
      return false;
    }
    const gcashDb = normalizePhMobileDb(values.email);
    if (identityEditable) {
      const name = values.shopName.trim();
      if (name.length < 2) {
        setError(t("business_phase7_508"));
        return false;
      }
      if (
        useDbTaxonomy &&
        storeCategoryId &&
        topicsForCategory.length > 0 &&
        !storeTopicId.trim()
      ) {
        setError(t("business_phase7_513"));
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
        menu_sold_out_bottom: values.menuSoldOutBottom,
      };
      const ml = manualMapLat.trim();
      const mn = manualMapLng.trim();
      let resolvedLat: number | null = null;
      let resolvedLng: number | null = null;
      if (ml || mn) {
        if (!ml || !mn) {
          setError(t("business_phase7_515"));
          setSubmitting(false);
          return false;
        }
        const la = parseFiniteLatitude(ml);
        const ln = parseFiniteLongitude(mn);
        if (la == null || ln == null) {
          setError(t("business_phase7_516"));
          setSubmitting(false);
          return false;
        }
        resolvedLat = la;
        resolvedLng = ln;
      } else if (storeLinkedUserAddress?.id) {
        /** 수동 좌표 비움: 주문자 배달 ETA·거리가 주소록 「매장」연결 주소 핀과 일치하도록 동기화 */
        const dlat = parseFiniteLatitude(storeLinkedUserAddress.latitude);
        const dlng = parseFiniteLongitude(storeLinkedUserAddress.longitude);
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
        setError(t("common_login_required"));
        return false;
      }
      if (!j?.ok || !j?.store) {
        const code = typeof j?.error === "string" ? j.error : "";
        setError(
          code === "invalid_ph_phone"
            ? t("business_phase7_499")
            : formatOwnerStorePatchError(code, language) ??
                (code ? code : t("business_phase7_517"))
        );
        return false;
      }
      onSaved();
      return true;
    } catch {
      setError(t("business_phase7_518"));
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
            ? "pb-[calc(60px+env(safe-area-inset-bottom,0px))]"
            : "pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:pb-3"
        }`}
      >
        <OwnerStoreAdminDashSection title={t("business_phase7_026")}>
        <div>
          <label className="mb-2 block sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_053")}</label>
          <div>
            <div className="relative inline-block shrink-0">
              <div className="h-20 w-20 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
                {values.profileImageUrl ? (
                  <img src={values.profileImageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center sam-text-xxs text-sam-meta">{t("common_none")}</div>
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
                    ? t("business_phase7_531")
                    : t("business_phase7_532")
                }
              >
                <span
                  className="sam-text-hero leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] sm:sam-text-hero"
                  aria-hidden
                >
                  📷
                </span>
                <span className="sr-only">
                  {values.profileImageUrl.trim()
                    ? t("business_phase7_533")
                    : t("business_phase7_534")}
                </span>
              </button>
            </div>
          </div>
          {uploading ? <p className="mt-1 sam-text-helper text-sam-muted">{t("business_phase7_188")}</p> : null}
        </div>

        <div>
          <p className="mb-1 block sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_081")}</p>
          <div className="mb-2 rounded-ui-rect border border-signature/25 bg-signature/5 px-2.5 py-2">
            <p className="sam-text-xxs font-normal leading-snug text-signature">
              {t("business_phase7_535")}
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
          <label className="mb-1 block sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_071")}</label>
          <textarea
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            rows={4}
            className={OWNER_STORE_CONTROL_CLASS}
            placeholder={t("business_phase7_028")}
          />
        </div>

        </OwnerStoreAdminDashSection>

        <OwnerStoreAdminDashSection title={t("business_phase7_025")}>
          <div className="flex cursor-pointer items-start gap-2.5 rounded-ui-rect border border-sam-border-soft bg-sam-app/40 px-3 py-2.5">
            <input
              id={`basic-menu-sold-out-bottom-${storeId}`}
              type="checkbox"
              checked={values.menuSoldOutBottom}
              onChange={(e) => setValues((v) => ({ ...v, menuSoldOutBottom: e.target.checked }))}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-sam-border text-signature"
            />
            <label htmlFor={`basic-menu-sold-out-bottom-${storeId}`} className="min-w-0 leading-snug">
              <span className="sam-text-body-secondary font-medium text-sam-fg">
                {t("business_phase7_536")}
              </span>
              <span className="mt-0.5 block sam-text-xxs text-sam-muted">
                {t("business_phase7_537")}
              </span>
            </label>
          </div>
        </OwnerStoreAdminDashSection>

        <OwnerStoreAdminDashSection title={t("business_phase7_195")}>
          <div className="space-y-4">
            <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-app/30">
              <div className="border-b border-sam-border-soft bg-sam-app/70 px-3 py-2">
                <p className="sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_194")}</p>
              </div>
              <div className="p-3 sm:p-4">
                <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
                  <div className="min-w-0">
                    <label className="mb-1 block sam-text-helper font-normal text-sam-muted">{t("business_phase7_245")}</label>
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
                    <label className="mb-1 block sam-text-helper font-normal text-sam-muted">{t("business_phase7_297")}</label>
                    <input
                      type="text"
                      value={values.kakaoId}
                      onChange={(e) => setValues((v) => ({ ...v, kakaoId: e.target.value }))}
                      className={OWNER_STORE_CONTROL_CLASS}
                      placeholder={t("business_phase7_193")}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-app/30">
              <div className="border-b border-sam-border-soft bg-sam-app/70 px-3 py-2">
                <p className="sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_012")}</p>
              </div>
              <div className="p-3 sm:p-4">
                <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
                  <div className="min-w-0">
                    <label className="mb-1 block sam-text-helper font-normal text-sam-muted">{t("business_phase7_337")}</label>
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
                    <label className="mb-1 block sam-text-helper font-normal text-sam-muted">{t("business_phase7_336")}</label>
                    <input
                      type="text"
                      autoComplete="name"
                      value={values.websiteUrl}
                      onChange={(e) => setValues((v) => ({ ...v, websiteUrl: e.target.value }))}
                      className={OWNER_STORE_CONTROL_CLASS}
                      placeholder={t("business_phase7_014")}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </OwnerStoreAdminDashSection>

        <OwnerStoreAdminDashSection title={t("business_phase7_080")}>
          <div className="space-y-4">
            {!storeMapCoordsOk ? (
              <div className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-3 py-2.5 sam-text-helper text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-semibold">{t("business_phase7_259")}</p>
                <p className="mt-1 leading-relaxed">{t("business_phase7_540")}</p>
                <div className={`mt-3 ${OWNER_STORE_FORM_GRID_2_CLASS}`}>
                  <div className="min-w-0">
                    <label className="mb-1 block font-medium text-amber-900 dark:text-amber-50">{t("business_phase7_229")}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={manualMapLat}
                      onChange={(e) => setManualMapLat(e.target.value)}
                      className={OWNER_STORE_CONTROL_CLASS}
                      placeholder={t("business_phase7_200")}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block font-medium text-amber-900 dark:text-amber-50">{t("business_phase7_013")}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={manualMapLng}
                      onChange={(e) => setManualMapLng(e.target.value)}
                      className={OWNER_STORE_CONTROL_CLASS}
                      placeholder={t("business_phase7_199")}
                    />
                  </div>
                </div>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-app/30">
              <div className="border-b border-sam-border-soft bg-sam-app/70 px-3 py-2">
                <p className="sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_276")}</p>
              </div>
              <div className="p-3 sm:p-4">
                <OwnerAddressBookSnapshotCard
                  bare
                  snapshotMode="store_linked"
                  returnToPath={`/stores/owner/basic-info?storeId=${encodeURIComponent(storeId)}`}
                  addressReady={addressReady}
                  addressDefault={storeLinkedUserAddress}
                  listError={addressBookListError}
                />
              </div>
            </div>

            {addressReady && !storeLinkedUserAddress?.id ? (
              <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-app/30">
                <div className="border-b border-sam-border-soft bg-sam-app/70 px-3 py-2">
                  <p className="sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_285")}</p>
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

        <OwnerStoreAdminDashSection title={t("business_phase7_190")}>
          {taxonomyLoading ? (
            <p className="sam-text-body-secondary text-sam-muted">{t("business_phase7_130")}</p>
          ) : identityEditable && useDbTaxonomy ? (
            <div className={`mt-2 ${OWNER_STORE_FORM_GRID_2_CLASS}`}>
              <div className="min-w-0">
                <label className="mb-1 block sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_005")}</label>
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
                <label className="mb-1 block sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_006")}</label>
                <select
                  value={storeTopicId}
                  onChange={(e) => setStoreTopicId(e.target.value)}
                  disabled={topicsForCategory.length === 0}
                  className={OWNER_STORE_SELECT_CLASS}
                >
                  {topicsForCategory.length === 0 ? (
                    <option value="">{t("business_phase7_161")}</option>
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
                  <>{t("business_phase7_541")}</>
                ) : (
                  <>{t("business_phase7_335")}<code className="rounded bg-amber-100 px-1">business_type</code>{t("business_phase7_001")}</>
                )}
              </p>
              <label className="mb-1 block sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_189")}</label>
              <select
                value={values.category}
                onChange={(e) => setValues((v) => ({ ...v, category: e.target.value }))}
                className={OWNER_STORE_SELECT_CLASS}
              >
                {primaryIndustryNames.length === 0 ? (
                  <option value={t("business_phase7_040")}>{t("business_phase7_040")}</option>
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
                <p className="mb-0.5 sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_005")}</p>
                <p className="sam-text-body font-normal text-sam-fg">{storeEmbedName(row.store_categories) || "—"}</p>
              </div>
              <div>
                <p className="mb-0.5 sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_006")}</p>
                <p className="sam-text-body font-normal text-sam-fg">{storeEmbedName(row.store_topics) || "—"}</p>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="sam-text-helper leading-relaxed text-amber-900">
                {taxonomyMeta?.source === "supabase_unconfigured" ? (
                  <>{t("business_phase7_542")}</>
                ) : taxonomyMeta?.store_topics_table === "missing" ? (
                  <>{t("business_phase7_543")}</>
                ) : (
                  <>{t("business_phase7_334")}</>
                )}
              </p>
              <p className="mb-0.5 sam-text-body-secondary font-bold text-sam-fg">{t("business_phase7_191")}</p>
              <p className="sam-text-body font-normal text-sam-fg">{(row.business_type || "—").trim() || "—"}</p>
            </div>
          )}
        </OwnerStoreAdminDashSection>
      </form>

      {isDirty ?
        <BodyPortal>
          <footer
            role="contentinfo"
            aria-label={t("business_phase7_039")}
            className={`pointer-events-none fixed inset-x-0 z-[54] border-t border-sam-border bg-sam-surface/95 backdrop-blur-md supports-[backdrop-filter]:bg-sam-surface/88 ${
              dockActionBarAboveMainBottomNav
                ? BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS
                : "bottom-0 pb-[env(safe-area-inset-bottom,0px)]"
            }`}
          >
            <div
              className={`pointer-events-auto ${OWNER_STORE_ADMIN_FOOTER_BAR_CLASS} ${OWNER_DESKTOP_SHELL_MIN_TW}:mx-auto ${OWNER_DESKTOP_SHELL_MIN_TW}:max-w-6xl ${OWNER_DESKTOP_SHELL_MIN_TW}:px-2 ${OWNER_DESKTOP_SHELL_MIN_TW}:pr-2`}
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
                  {t("common_cancel")}
                </button>
                <button
                  type="submit"
                  form="owner-store-basic-info-form"
                  disabled={submitting || uploading || leaveSaving || saveConfirmOpen}
                  className={`${BOTTOM_NAV_SHELL.heightClass} min-w-0 flex-1 rounded-none border-0 bg-signature px-2 sam-text-body font-medium text-white disabled:opacity-50`}
                >
                  {submitting ? t("business_phase7_384") : t("common_save")}
                </button>
              </div>
            </div>
          </footer>
        </BodyPortal>
      : null}

      <OwnerStoreAdminConfirmModal
        open={saveConfirmOpen}
        titleId="owner-basic-info-save-confirm-title"
        title={t("business_phase7_039")}
        description={saveConfirmDescription}
        cancelLabel={t("common_cancel")}
        confirmLabel={t("common_save")}
        confirmBusyLabel={t("business_phase7_384")}
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
