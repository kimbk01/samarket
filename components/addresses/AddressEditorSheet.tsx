"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserAddressDTO, UserAddressLabelType } from "@/lib/addresses/user-address-types";
import { normalizeOptionalPhMobileDb, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import { normalizeAddressNicknameKey } from "@/lib/addresses/address-nickname-key";
import { encodeShopAddressNickname } from "@/lib/addresses/shop-address-nickname";
import { fetchPlacePredictionsPh, type PlacePredictionRow } from "@/lib/map/fetch-place-predictions-ph";
import { PLACE_FIELDS_POI_FULL } from "@/lib/map/places-new-api";
import { fetchPlaceDetailsAsLegacyPlaceResultCached } from "@/lib/addresses/google-place-details-client-cache";
import { parsePhFromGooglePlaceResult } from "@/lib/addresses/ph-google-place-address-components";
import { formatPhDeliveryStreetSummary, formatPhAddressCardOneLinePlain } from "@/lib/addresses/ph-address-display";
import { stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";
import { AddressSummaryMapPreview } from "@/components/addresses/AddressSummaryMapPreview";
import { AddressFineTuneSheet } from "@/components/addresses/AddressFineTuneSheet";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { ReverseGeocodePhResult } from "@/lib/addresses/reverse-geocode-ph-client";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  ADDRESS_PRESET_NICKNAME_HOME,
  ADDRESS_PRESET_NICKNAME_OFFICE,
} from "@/components/addresses/address-labels";
import { UserAddressDesignationTitle } from "@/components/addresses/UserAddressDesignationTitle";
import {
  decodeLocationOnlyAddressNicknameId,
  encodeLocationOnlyAddressNickname,
  isLocationOnlyAddressNickname,
} from "@/lib/addresses/location-only-address-nickname";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";

type Mode = "create" | "edit";

type LabelPreset = null | "home" | "shop" | "office" | "custom";

function deriveLabelPresetFromDto(row: UserAddressDTO): LabelPreset {
  if (row.labelType === "shop") return "shop";
  if (row.labelType === "office") return "office";
  if (row.labelType === "other") return "custom";
  return "home";
}

export function AddressEditorSheet(props: {
  open: boolean;
  mode: Mode;
  initial: UserAddressDTO | null;
  /** 부모가 `/address/select` 복귀 시 sessionStorage 에서 소비한 좌표·주소 */
  mapBootstrap?: {
    latitude: number;
    longitude: number;
    fullAddress: string;
    addressDetail?: string | null;
  } | null;
  onClose: () => void;
  onSaved: () => void;
  /** 중복 지정 주소 검사용(현재 사용자 주소 목록) */
  allAddresses?: UserAddressDTO[];
  /** 전체 페이지 편집(목록과 분리) — 기본은 모달 */
  layout?: "modal" | "page";
}) {
  const {
    open,
    mode,
    initial,
    mapBootstrap = null,
    onClose,
    onSaved,
    allAddresses = [],
    layout = "modal",
  } = props;
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [nickname, setNickname] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [barangay, setBarangay] = useState("");
  const [cityMunicipality, setCityMunicipality] = useState("");
  const [province, setProvince] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [unitFloorRoom, setUnitFloorRoom] = useState("");
  const [landmark, setLandmark] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [formattedAddress, setFormattedAddress] = useState("");
  const [roadAddress, setRoadAddress] = useState("");
  const [fullAddress, setFullAddress] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [neighborhoodName, setNeighborhoodName] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [predictions, setPredictions] = useState<PlacePredictionRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [useLife, setUseLife] = useState(true);
  const [useTrade, setUseTrade] = useState(true);
  const [useDel, setUseDel] = useState(true);
  const [defMaster, setDefMaster] = useState(false);
  const [defLife, setDefLife] = useState(false);
  const [defTrade, setDefTrade] = useState(false);
  const [defDel, setDefDel] = useState(false);

  const [labelPreset, setLabelPreset] = useState<LabelPreset>(null);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [meStores, setMeStores] = useState<StoreRow[]>([]);
  const [meStoresLoading, setMeStoresLoading] = useState(false);
  const [shopListErr, setShopListErr] = useState<string | null>(null);
  const [preflightSave, setPreflightSave] = useState<{
    conflict: UserAddressDTO | null;
    includeStoreLinkNotice: boolean;
  } | null>(null);
  const [detailAttempted, setDetailAttempted] = useState(false);

  /**
   * 예측 선택 후 `setSearch`로 검색창이 긴 확정 주소로 바뀌면, 같은 문자열로 자동완성 effect가
   * 다시 돌아 목록이 재등장하는(이중 선택처럼 보이는) 루프가 생긴다. 확정 직후의 검색문과
   * 일치할 때는 자동완성을 건너뛴다 — 사용자가 검색어를 바꾸면 다시 조회된다.
   */
  const selectionAnchorSearchRef = useRef<string | null>(null);

  const applyStoreRow = useCallback((row: StoreRow) => {
    const la = row.lat != null ? Number(row.lat) : NaN;
    const ln = row.lng != null ? Number(row.lng) : NaN;
    setLatitude(Number.isFinite(la) ? la : null);
    setLongitude(Number.isFinite(ln) ? ln : null);
    setPlaceId((row.place_id ?? "").trim());
    const fmt = (row.formatted_address ?? "").trim();
    const line1 = (row.address_line1 ?? "").trim();
    setFormattedAddress(fmt || line1);
    setRoadAddress(line1 || fmt);
    setFullAddress(fmt || line1);
    setStreetAddress(line1);
    setUnitFloorRoom((row.detail_address ?? "").trim());
    setRegion((row.region ?? "").trim());
    setCity((row.city ?? "").trim());
    setBarangay("");
    setCityMunicipality(((row.district ?? row.city) ?? "").trim());
    setProvince("");
    /** `building_name`(DB)은 지도 POI 전용. 매장 표시명은 `linkedStoreId`·별도 UI로만 노출한다. */
    setBuildingName("");
    const anchor = (fmt || line1).trim();
    setSearch(anchor);
    selectionAnchorSearchRef.current = anchor.length >= 2 ? anchor : null;
    if (!(row.place_id ?? "").trim()) {
      setErr(t("addr_ui_store_no_place"));
    } else {
      setErr(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setPreflightSave(null);
    setDetailAttempted(false);
    setShopListErr(null);
    selectionAnchorSearchRef.current = null;
    if (mode === "edit" && initial) {
      setLabelPreset(deriveLabelPresetFromDto(initial));
      setSelectedStoreId(initial.linkedStoreId?.trim() ?? "");
      setNickname(
        isLocationOnlyAddressNickname(initial.nickname) ? "" : (initial.nickname ?? ""),
      );
      setRecipientName(initial.recipientName ?? "");
      setPhoneNumber(parsePhMobileInput(initial.phoneNumber ?? ""));
      setRegion(initial.appRegionId ?? "");
      setCity(initial.appCityId ?? "");
      setBarangay(initial.barangay ?? "");
      setCityMunicipality(initial.cityMunicipality ?? "");
      setProvince(initial.province ?? "");
      {
        if (initial.labelType === "shop") {
          setStreetAddress((initial.streetAddress ?? "").trim());
        } else {
          const b = (initial.buildingName ?? "").trim();
          const s = (initial.streetAddress ?? "").trim();
          const merged = b && s ? `${b} ${s}`.trim() : b || s;
          setStreetAddress(merged);
        }
      }
      setLandmark(initial.landmark ?? "");
      setBuildingName(initial.buildingName ?? "");
      if (mapBootstrap) {
        setLatitude(mapBootstrap.latitude);
        setLongitude(mapBootstrap.longitude);
        setFullAddress(mapBootstrap.fullAddress.trim());
        setFormattedAddress(mapBootstrap.fullAddress.trim());
        setRoadAddress(mapBootstrap.fullAddress.trim());
        setUnitFloorRoom((mapBootstrap.addressDetail ?? "").trim());
      } else {
        setLatitude(initial.latitude ?? null);
        setLongitude(initial.longitude ?? null);
        setPlaceId(initial.placeId ?? "");
        setFormattedAddress(initial.formattedAddress ?? initial.fullAddress ?? "");
        setRoadAddress(initial.roadAddress ?? initial.streetAddress ?? "");
        setFullAddress(initial.fullAddress ?? initial.formattedAddress ?? "");
        setUnitFloorRoom(initial.detailAddress ?? initial.unitFloorRoom ?? "");
      }
      setDeliveryNote(initial.deliveryNote ?? "");
      {
        const anchor = (initial.roadAddress ?? initial.formattedAddress ?? initial.fullAddress ?? "").trim();
        setSearch(anchor);
        if ((initial.placeId ?? "").trim() && anchor.length >= 2) {
          selectionAnchorSearchRef.current = anchor;
        }
      }
      setNeighborhoodName(initial.neighborhoodName ?? "");
      setUseLife(initial.useForLife);
      setUseTrade(initial.useForTrade);
      setUseDel(initial.useForDelivery);
      setDefMaster(false);
      setDefLife(false);
      setDefTrade(false);
      setDefDel(false);
      setFineTuneOpen(false);
    } else if (mode === "create") {
      setLabelPreset(null);
      setSelectedStoreId("");
      setNickname("");
      setRecipientName("");
      setPhoneNumber("");
      setRegion("");
      setCity("");
      setBarangay("");
      setCityMunicipality("");
      setProvince("");
      setStreetAddress("");
      setUnitFloorRoom("");
      setLandmark("");
      setBuildingName("");
      if (mapBootstrap) {
        setLatitude(mapBootstrap.latitude);
        setLongitude(mapBootstrap.longitude);
        setFullAddress(mapBootstrap.fullAddress.trim());
        setFormattedAddress(mapBootstrap.fullAddress.trim());
        setRoadAddress(mapBootstrap.fullAddress.trim());
        setUnitFloorRoom((mapBootstrap.addressDetail ?? "").trim());
      } else {
        setLatitude(null);
        setLongitude(null);
        setPlaceId("");
        setFormattedAddress("");
        setRoadAddress("");
        setFullAddress("");
      }
      setDeliveryNote("");
      if (mapBootstrap?.fullAddress?.trim()) {
        const a = mapBootstrap.fullAddress.trim();
        setSearch(a);
        selectionAnchorSearchRef.current = a.length >= 2 ? a : null;
      } else {
        setSearch("");
      }
      setNeighborhoodName("");
      setUseLife(true);
      setUseTrade(true);
      setUseDel(true);
      setDefMaster(false);
      setDefLife(false);
      setDefTrade(false);
      setDefDel(false);
      setFineTuneOpen(false);
    }
  }, [open, mode, initial, mapBootstrap]);

  useEffect(() => {
    if (!open) return;
    const q = search.trim();
    if (q.length < 2) {
      selectionAnchorSearchRef.current = null;
      setPredictions([]);
      setSearching(false);
      return;
    }
    if (
      latitude != null &&
      longitude != null &&
      selectionAnchorSearchRef.current != null &&
      q === selectionAnchorSearchRef.current
    ) {
      setPredictions([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await fetchPlacePredictionsPh(q);
          if (!cancelled) setPredictions(rows);
        } catch {
          if (!cancelled) setPredictions([]);
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, search, latitude, longitude]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setMeStoresLoading(true);
      setShopListErr(null);
      try {
        const res = await fetch("/api/me/stores", { credentials: "include" });
        const j = (await res.json()) as { ok?: boolean; stores?: StoreRow[]; error?: string };
        if (!res.ok || !j.ok) {
          throw new Error(typeof j.error === "string" ? j.error : t("addr_ui_shop_list_failed"));
        }
        const approvedStores = Array.isArray(j.stores)
          ? j.stores.filter((store) => store.approval_status === "approved")
          : [];
        if (!cancelled) setMeStores(approvedStores);
      } catch (e) {
        if (!cancelled) {
          setShopListErr(e instanceof Error ? e.message : t("common_error"));
          setMeStores([]);
        }
      } finally {
        if (!cancelled) setMeStoresLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const applyFineTuneResult = useCallback((r: ReverseGeocodePhResult) => {
    if (!r.placeId) return;
    setLatitude(r.latitude);
    setLongitude(r.longitude);
    setPlaceId(r.placeId);
    setFormattedAddress(r.formattedAddress);
    setFullAddress(r.formattedAddress);
    setRoadAddress(r.formattedAddress);
    const ph = r.parsed;
    const headLine = r.formattedAddress.split(",")[0]?.trim() ?? "";
    setStreetAddress(ph.routeLine || headLine);
    setBarangay(ph.barangay ?? "");
    setCityMunicipality(ph.cityMunicipality ?? "");
    setProvince(ph.province ?? "");
    setNeighborhoodName(ph.neighborhood ?? "");
    setBuildingName(ph.buildingOrPlaceHeadline ?? "");
    setUnitFloorRoom("");
    const s = r.formattedAddress.trim();
    setSearch(s);
    selectionAnchorSearchRef.current = s.length >= 2 ? s : null;
  }, []);

  const streetPreview = useMemo(() => {
    return formatPhDeliveryStreetSummary({
      countryCode: "PH",
      countryName: "Philippines",
      roadAddress: roadAddress || null,
      formattedAddress: formattedAddress || null,
      fullAddress: fullAddress || null,
    } as UserAddressDTO);
  }, [roadAddress, formattedAddress, fullAddress]);

  async function selectPrediction(row: PlacePredictionRow) {
    if (!row.placeId.trim()) return;
    setResolvingPlaceId(row.placeId);
    setErr(null);
    try {
      const detail = await fetchPlaceDetailsAsLegacyPlaceResultCached(row.placeId, PLACE_FIELDS_POI_FULL);
      const loc = detail?.geometry?.location;
      const lat = typeof loc?.lat === "function" ? loc.lat() : null;
      const lng = typeof loc?.lng === "function" ? loc.lng() : null;
      const formatted = (detail?.formatted_address ?? row.description ?? "").trim();
      if (!formatted || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        setErr(t("addr_ui_coords_invalid"));
        return;
      }
      const ph = parsePhFromGooglePlaceResult(detail);
      const label = (row.description || formatted).trim();
      selectionAnchorSearchRef.current = label.length >= 2 ? label : null;
      setPlaceId(row.placeId);
      setFormattedAddress(formatted);
      setRoadAddress(row.description || formatted);
      setFullAddress(formatted);
      setStreetAddress(ph.routeLine || row.mainText || formatted);
      setBarangay(ph.barangay ?? "");
      setCityMunicipality(ph.cityMunicipality ?? "");
      setProvince(ph.province ?? "");
      setNeighborhoodName(ph.neighborhood ?? "");
      setBuildingName(ph.buildingOrPlaceHeadline ?? "");
      setLatitude(lat);
      setLongitude(lng);
      setUnitFloorRoom("");
      setPredictions([]);
      setSearch(label);
      setFineTuneOpen(false);
      window.setTimeout(() => {
        document.getElementById("addr-editor-detail")?.focus();
      }, 0);
    } finally {
      setResolvingPlaceId(null);
    }
  }

  async function saveAddress(opts?: { skipDupCheck?: boolean; skipShopAck?: boolean }) {
    setBusy(true);
    setErr(null);
    setDetailAttempted(true);
    const ph = normalizeOptionalPhMobileDb(phoneNumber);
    if (!ph.ok) {
      setErr(ph.error);
      setBusy(false);
      return;
    }
    if (!labelPreset) {
      setErr(t("addr_ui_pick_label_type"));
      setBusy(false);
      return;
    }
    if (
      labelPreset === "custom" &&
      !nickname.trim() &&
      !(mode === "edit" && initial && isLocationOnlyAddressNickname(initial.nickname))
    ) {
      setErr(t("addr_ui_custom_name_required"));
      setBusy(false);
      return;
    }
    if (labelPreset === "shop" && !selectedStoreId.trim()) {
      setErr(t("addr_ui_pick_shop"));
      setBusy(false);
      return;
    }
    if (labelPreset === "shop" && !meStores.some((store) => store.id === selectedStoreId.trim())) {
      setErr(t("addr_ui_store_permission"));
      setBusy(false);
      return;
    }
    if (labelPreset === "custom") {
      const reservedId = decodeLocationOnlyAddressNicknameId(nickname.trim());
      if (reservedId != null) {
        const allowedSelf = mode === "edit" && initial && reservedId === initial.id.trim();
        if (!allowedSelf) {
          setErr(t("addr_ui_name_invalid"));
          setBusy(false);
          return;
        }
      }
    }

    const siblingRows = allAddresses.filter((a) => !(mode === "edit" && initial?.id === a.id));

    const resolvedNickname =
      labelPreset === "home"
        ? ADDRESS_PRESET_NICKNAME_HOME
        : labelPreset === "office"
          ? ADDRESS_PRESET_NICKNAME_OFFICE
          : labelPreset === "shop"
            ? encodeShopAddressNickname(selectedStoreId)
            : nickname.trim() ||
              (mode === "edit" && initial && isLocationOnlyAddressNickname(initial.nickname)
                ? encodeLocationOnlyAddressNickname(initial.id)
                : "");

    const submitLabelType: UserAddressLabelType =
      labelPreset === "custom" ? "other" : labelPreset === "shop" ? "shop" : labelPreset === "office" ? "office" : "home";

    try {
      if (!placeId.trim()) {
        setErr(t("addr_ui_pick_search_result"));
        setBusy(false);
        return;
      }
      if (latitude == null || longitude == null || !formattedAddress.trim()) {
        setErr(t("addr_ui_coords_retry"));
        setBusy(false);
        return;
      }
      if (!unitFloorRoom.trim()) {
        setErr(t("addr_ui_detail_required"));
        setBusy(false);
        return;
      }

      const needsStoreLinkNotice =
        labelPreset === "shop" &&
        !opts?.skipShopAck &&
        (mode === "create" ||
          initial?.labelType !== "shop" ||
          (initial?.linkedStoreId?.trim() ?? "") !== selectedStoreId.trim());

      if (!opts?.skipDupCheck) {
        const nameKey = normalizeAddressNicknameKey(resolvedNickname);
        const conflict =
          siblingRows.find((a) => normalizeAddressNicknameKey(a.nickname ?? "") === nameKey) ?? null;
        if (conflict || needsStoreLinkNotice) {
          setPreflightSave({
            conflict,
            includeStoreLinkNotice: needsStoreLinkNotice,
          });
          setBusy(false);
          return;
        }
      }
      const body = {
        labelType: submitLabelType,
        linkedStoreId: submitLabelType === "shop" ? selectedStoreId.trim() : null,
        nickname: resolvedNickname,
        recipientName: recipientName.trim() || null,
        phoneNumber: ph.value,
        appRegionId: region.trim() || null,
        appCityId: city.trim() || null,
        barangay: barangay.trim() || null,
        cityMunicipality: cityMunicipality.trim() || null,
        province: province.trim() || null,
        streetAddress: streetAddress.trim() || null,
        buildingName: buildingName.trim() || null,
        unitFloorRoom: unitFloorRoom.trim() || null,
        landmark: landmark.trim() || null,
        latitude,
        longitude,
        placeId: placeId.trim(),
        formattedAddress: formattedAddress.trim(),
        roadAddress: roadAddress.trim() || formattedAddress.trim(),
        detailAddress: unitFloorRoom.trim(),
        deliveryNote: deliveryNote.trim() || null,
        fullAddress: formattedAddress.trim() || fullAddress.trim() || null,
        neighborhoodName: neighborhoodName.trim() || null,
        useForLife: useLife,
        useForTrade: useTrade,
        useForDelivery: useDel,
        isDefaultMaster: defMaster,
        isDefaultLife: defLife,
        isDefaultTrade: defTrade,
        isDefaultDelivery: defDel,
      };
      const url = mode === "create" ? "/api/me/addresses" : `/api/me/addresses/${initial?.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(typeof j.error === "string" ? j.error : t("addr_ui_save_failed"));
        return;
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function confirmPreflightSave() {
    const pending = preflightSave;
    if (!pending) return;
    setPreflightSave(null);
    setErr(null);

    if (pending.conflict) {
      const id = pending.conflict.id;
      setBusy(true);
      try {
        const d = await fetch(`/api/me/addresses/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            labelType: "other",
            linkedStoreId: null,
            nickname: encodeLocationOnlyAddressNickname(id),
          }),
        });
        const j = (await d.json()) as { ok?: boolean; error?: string };
        if (!d.ok || !j.ok) {
          setErr(typeof j.error === "string" ? j.error : t("addr_ui_unset_designation_failed"));
          setBusy(false);
          return;
        }
      } finally {
        setBusy(false);
      }
    }

    await saveAddress({ skipDupCheck: true, skipShopAck: true });
  }

  const fieldLabelClass = "mb-1.5 block text-[12px] font-semibold leading-4 text-sam-muted";
  const fieldInputClass =
    "w-full rounded-lg border border-sam-border bg-sam-app px-3 py-2.5 sam-text-body text-sam-fg outline-none transition-shadow placeholder:text-sam-muted focus-visible:border-sam-primary focus-visible:ring-2 focus-visible:ring-sam-primary/20";
  const chipBase =
    "shrink-0 whitespace-nowrap rounded-xl border px-3 py-2.5 sam-text-body font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sam-primary/30";
  const chipOff = "border-sam-border bg-sam-app text-sam-fg hover:border-sam-primary/40";
  const chipOn = "border-sam-primary bg-sam-primary text-white";

  if (!open) return null;

  const pageTitle = mode === "edit" ? t("addr_ui_edit_title") : t("addr_ui_add_title");
  const saveLabel = layout === "page" ? t("addr_ui_save_address") : t("common_save");
  const detailViol = detailAttempted && latitude != null && longitude != null && !unitFloorRoom.trim();
  const geoReady = latitude != null && longitude != null && !!formattedAddress.trim();
  const saveDisabled =
    busy ||
    !labelPreset ||
    (labelPreset === "shop" && !selectedStoreId.trim()) ||
    (labelPreset === "custom" &&
      !nickname.trim() &&
      !(mode === "edit" && initial && isLocationOnlyAddressNickname(initial.nickname))) ||
    !geoReady;
  const hasApprovedStoreAddressSource = meStores.length > 0;
  const selectedStoreDisplayName = (
    meStores.find((store) => store.id.trim() === selectedStoreId.trim())?.store_name ?? ""
  ).trim();

  const scrollShellClass =
    layout === "page"
      ? "w-full min-w-0 overflow-y-auto"
      : "min-h-0 w-full max-h-[min(52dvh,400px)] overflow-y-auto px-3 sm:max-h-[min(62dvh,480px)] sm:px-4";

  const editorScrollBody = (
    <div className={scrollShellClass}>
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <OwnerStoreAdminDashSection title={t("addr_ui_designation_section")}>
          <div>
            <p className="mb-3 sam-text-xxs leading-snug text-sam-muted sm:mb-3.5">
              {t("addr_ui_designation_hint")}
            </p>
            <div className="-mx-1 flex min-w-0 flex-nowrap gap-2 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => {
                  setLabelPreset("home");
                  setSelectedStoreId("");
                  setErr(null);
                }}
                className={`${chipBase} ${labelPreset === "home" ? chipOn : chipOff}`}
              >
                {t("addr_ui_preset_home")}
              </button>
              {hasApprovedStoreAddressSource ? (
                <button
                  type="button"
                  onClick={() => {
                    setLabelPreset("shop");
                    setErr(null);
                  }}
                  className={`${chipBase} ${labelPreset === "shop" ? chipOn : chipOff}`}
                >
                  {t("addr_ui_preset_shop")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setLabelPreset("office");
                  setSelectedStoreId("");
                  setErr(null);
                }}
                className={`${chipBase} ${labelPreset === "office" ? chipOn : chipOff}`}
              >
                {t("addr_ui_preset_office")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLabelPreset("custom");
                  setSelectedStoreId("");
                  setErr(null);
                }}
                className={`${chipBase} ${labelPreset === "custom" ? chipOn : chipOff}`}
              >
                {t("addr_ui_preset_custom")}
              </button>
            </div>
            {!labelPreset ? (
              <p className="mt-2 sam-text-helper font-medium text-sam-danger">{t("addr_ui_pick_type_err")}</p>
            ) : null}
            {!meStoresLoading && !hasApprovedStoreAddressSource ? (
              <p className="mt-2 sam-text-helper font-medium text-sam-muted">
                {t("addr_ui_store_permission")}
              </p>
            ) : null}
          </div>

          {labelPreset === "shop" ? (
            <div className="space-y-2">
              <span className={fieldLabelClass}>{t("addr_ui_linked_store")}</span>
              {meStoresLoading ? (
                <p className="sam-text-helper text-sam-muted">{t("addr_ui_shop_list_loading")}</p>
              ) : null}
              <p className="sam-text-helper leading-relaxed text-sam-muted">
                {t("addr_ui_store_link_hint")}
              </p>
              {shopListErr ? <p className="sam-text-helper text-sam-danger">{shopListErr}</p> : null}
              {!meStoresLoading && !shopListErr && meStores.length === 0 ? (
                <p className="sam-text-body-secondary leading-relaxed text-sam-danger">
                  {t("addr_ui_store_permission")}
                </p>
              ) : !meStoresLoading && meStores.length > 0 ? (
                <select
                  value={selectedStoreId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedStoreId(id);
                    setErr(null);
                    const row = meStores.find((s) => s.id === id);
                    if (row) applyStoreRow(row);
                  }}
                  className={fieldInputClass}
                  aria-label={t("addr_ui_pick_store_aria")}
                >
                  <option value="">{t("addr_ui_pick_store")}</option>
                  {meStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {(s.slug || s.store_name || s.id).trim()}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}

          {labelPreset === "custom" ? (
            <div>
              <label htmlFor="addr-editor-nick-custom" className={fieldLabelClass}>
                {t("addr_ui_custom_name_label")}
              </label>
              <input
                id="addr-editor-nick-custom"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setErr(null);
                }}
                placeholder={t("addr_ui_custom_name_ph")}
                autoComplete="off"
                className={fieldInputClass}
              />
            </div>
          ) : null}
        </OwnerStoreAdminDashSection>

        <OwnerStoreAdminDashSection title={t("addr_ui_search_section")}>
          <div>
            <label htmlFor="addr-editor-search" className={fieldLabelClass}>
              {t("addr_ui_search_label")}
            </label>
            <input
              id="addr-editor-search"
              value={search}
              onFocus={() => {
                if (!search.trim()) return;
                selectionAnchorSearchRef.current = null;
                setSearch("");
                setPredictions([]);
                setSearching(false);
                setErr(null);
                setUnitFloorRoom("");
              }}
              onChange={(e) => {
                setSearch(e.target.value);
                setErr(null);
              }}
              placeholder="Building, mall, street, barangay (English OK)"
              autoComplete="street-address"
              enterKeyHint="search"
              className={fieldInputClass}
            />
            {searching ? (
              <p className="mt-2 sam-text-helper text-sam-muted">{t("addr_ui_searching")}</p>
            ) : predictions.length > 0 ? (
              <ul className="mt-2 overflow-hidden rounded-lg border border-sam-border bg-sam-surface">
                {predictions.map((p) => (
                  <li key={p.placeId} className="border-b border-sam-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => void selectPrediction(p)}
                      disabled={resolvingPlaceId === p.placeId}
                      className="block min-h-[44px] w-full px-3 py-2.5 text-left hover:bg-sam-app disabled:opacity-60"
                    >
                      <span className="block sam-text-body font-semibold text-sam-fg">{p.mainText}</span>
                      <span className="mt-0.5 block sam-text-helper text-sam-muted">
                        {p.secondaryText || p.description}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </OwnerStoreAdminDashSection>

        <OwnerStoreAdminDashSection title={t("addr_ui_detail_delivery_section")}>
          {latitude != null && longitude != null ? (
            <>
              <div>
                <span className={fieldLabelClass}>{t("addr_ui_place_summary")}</span>
                <p className="mb-2 sam-text-xxs leading-snug text-sam-muted">
                  {t("addr_ui_map_tap_hint")}
                </p>
                <div className="flex gap-3 rounded-lg border border-sam-border bg-sam-app px-3 py-2.5">
                  <div className="relative shrink-0">
                    <AddressSummaryMapPreview lat={latitude} lng={longitude} sizePx={72} />
                    <button
                      type="button"
                      className="absolute inset-0 rounded-ui-rect bg-transparent transition-colors hover:bg-black/[0.06] active:bg-black/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sam-primary/35"
                      aria-label={t("addr_ui_open_fine_tune")}
                      onClick={() => setFineTuneOpen(true)}
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    {buildingName.trim() ? (
                      <p className="sam-text-body font-semibold leading-snug text-sam-fg">{buildingName.trim()}</p>
                    ) : null}
                    <p className="sam-text-body-secondary leading-relaxed text-sam-fg">
                      {streetPreview ||
                        stripCountryFromAddressDisplayLine(
                          (formattedAddress || fullAddress).trim(),
                          "Philippines",
                        ) ||
                        `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="addr-editor-detail" className={fieldLabelClass}>
                  {t("addr_ui_detail_required_label")}
                </label>
                <input
                  id="addr-editor-detail"
                  value={unitFloorRoom}
                  onChange={(e) => setUnitFloorRoom(e.target.value)}
                  placeholder={t("addr_ui_detail_ph")}
                  autoComplete="address-line2"
                  aria-invalid={detailViol}
                  className={`${fieldInputClass} ${detailViol ? "border-sam-danger focus-visible:border-sam-danger focus-visible:ring-sam-danger/25" : ""}`}
                />
                {detailViol ? (
                  <p className="mt-1.5 sam-text-helper font-medium text-sam-danger">{t("addr_ui_detail_required_err")}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="addr-editor-note" className={fieldLabelClass}>
                  {t("addr_ui_delivery_note")}
                </label>
                <textarea
                  id="addr-editor-note"
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  placeholder={t("addr_ui_delivery_ph")}
                  rows={2}
                  autoComplete="off"
                  className={`${fieldInputClass} min-h-[4.5rem] resize-y`}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="addr-editor-detail-empty" className={fieldLabelClass}>
                  {t("addr_ui_detail_after_search")}
                </label>
                <input
                  id="addr-editor-detail-empty"
                  value={unitFloorRoom}
                  onChange={(e) => setUnitFloorRoom(e.target.value)}
                  placeholder={t("addr_ui_detail_after_search_ph")}
                  autoComplete="off"
                  disabled
                  className={fieldInputClass}
                />
              </div>
              <p className="rounded-lg border border-dashed border-sam-border bg-sam-app/60 px-3 py-2.5 text-center sam-text-body-secondary text-sam-muted">
                {t("addr_ui_search_first_hint")}
              </p>
            </>
          )}
        </OwnerStoreAdminDashSection>
      </div>
    </div>
  );

  const editorFooter = (
    <div
      className={`shrink-0 space-y-2 border-t border-sam-border bg-sam-app/40 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-3 ${
        layout === "page" ? "w-full min-w-0" : "px-3 sm:px-4"
      }`}
    >
      {err ? <p className="text-center sam-text-body-secondary font-medium text-sam-danger">{err}</p> : null}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={saveDisabled}
          onClick={() => void saveAddress()}
          className="min-h-[44px] w-full rounded-lg bg-sam-primary py-2.5 sam-text-body font-semibold text-white shadow-sm transition-opacity hover:bg-sam-primary-hover disabled:opacity-40 sm:min-h-[48px]"
        >
          {busy ? t("addr_ui_saving") : saveLabel}
        </button>
      </div>
    </div>
  );

  const preflightConflictRow = preflightSave?.conflict ?? null;
  const preflightConflictSamarketName =
    preflightConflictRow?.labelType === "shop"
      ? (meStores.find((store) => store.id.trim() === (preflightConflictRow.linkedStoreId ?? "").trim())?.store_name ?? "")
          .trim() || null
      : null;

  const preflightSaveModal =
    preflightSave && open ? (
      <div
        className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-4"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) setPreflightSave(null);
        }}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-sam-border bg-sam-surface p-4 text-sam-fg shadow-xl"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="addr-preflight-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="addr-preflight-title" className="text-[17px] font-bold leading-6">
            {t("addr_ui_save_confirm_title")}
          </h3>
          {preflightSave.includeStoreLinkNotice ? (
            <div className="mt-2 space-y-1 sam-text-body-secondary leading-relaxed text-sam-fg">
              <p>
                {t("addr_ui_store_save_hint")}
                
              </p>
              {selectedStoreDisplayName ? (
                <p>
                  <span className="font-semibold text-sam-fg">{t("addr_ui_store_profile_name")}</span>{" "}
                  <span translate="no">{selectedStoreDisplayName}</span>
                  <span className="text-sam-muted">{t("addr_ui_store_name_mismatch")}</span>
                </p>
              ) : null}
            </div>
          ) : null}
          {preflightSave.conflict ? (
            <>
              <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-fg">
                {t("addr_ui_conflict_hint")}
              </p>
              <div className="mt-3 rounded-lg border border-sam-border bg-sam-app px-3 py-2.5">
                <div className="flex min-h-[1.25em] items-center sam-text-body font-semibold text-sam-fg">
                  <UserAddressDesignationTitle
                    row={preflightSave.conflict}
                    linkedSamarketStoreDisplayName={preflightConflictSamarketName}
                  />
                </div>
                <p className="mt-1 line-clamp-3 sam-text-helper text-sam-muted" translate="no">
                  {(preflightSave.conflict.countryCode ?? "PH").trim().toUpperCase() === "PH"
                    ? formatPhAddressCardOneLinePlain(preflightSave.conflict, {
                        suppressGateBuildingIfMatchesSamarketStore: preflightConflictSamarketName,
                      })
                    : preflightSave.conflict.formattedAddress ?? preflightSave.conflict.fullAddress ?? "—"}
                </p>
              </div>
            </>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => !busy && setPreflightSave(null)}
              className="w-full rounded-lg border border-sam-border bg-sam-app py-2.5 sam-text-body font-semibold text-sam-fg sm:w-auto sm:px-4"
            >
              {t("common_cancel")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmPreflightSave()}
              className="w-full rounded-lg bg-sam-primary py-2.5 sam-text-body font-semibold text-white sm:w-auto sm:px-4"
            >
              {busy ? t("common_processing") : preflightSave.conflict ? t("addr_ui_unset_then_save") : t("common_save")}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const fineTuneLayer =
    fineTuneOpen && latitude != null && longitude != null ? (
      <AddressFineTuneSheet
        open={fineTuneOpen}
        latitude={latitude}
        longitude={longitude}
        onClose={() => setFineTuneOpen(false)}
        onApply={applyFineTuneResult}
      />
    ) : null;

  if (layout === "page") {
    return (
      <>
        <div className="flex min-h-screen w-full min-w-0 max-w-[100dvw] flex-col overflow-x-clip bg-sam-app">
          <MySubpageHeader title={pageTitle} backHref="/mypage/addresses" hideCtaStrip />
          <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} min-h-0 flex-1 overflow-y-auto`}>
            {editorScrollBody}
            {editorFooter}
          </div>
        </div>
        {fineTuneLayer}
        {preflightSaveModal}
      </>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 sm:p-6"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="flex max-h-[min(88dvh,640px)] w-full max-w-md min-w-0 flex-col overflow-hidden rounded-2xl bg-sam-surface text-sam-fg shadow-[0_4px_24px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.06]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="addr-editor-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-sam-border px-4 py-3">
            <h2 id="addr-editor-title" className="text-[17px] font-bold leading-6 tracking-tight text-sam-fg">
              {t("addr_ui_address_detail_header")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-sam-muted transition-colors hover:bg-sam-app hover:text-sam-fg"
              aria-label={t("common_close")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          {editorScrollBody}
          {editorFooter}
        </div>
      </div>
      {fineTuneLayer}
      {preflightSaveModal}
    </>
  );
}
