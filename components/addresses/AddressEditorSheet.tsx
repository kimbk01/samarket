"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserAddressDTO, UserAddressLabelType } from "@/lib/addresses/user-address-types";
import { StoreAddressStreetDetailGrid } from "@/components/stores/StoreAddressStreetDetailGrid";
import { STORE_ADDRESS_BOOK_STREET_BLOCK_INTRO } from "@/lib/stores/store-address-form-ui";
import { ADDRESS_LABEL_KO } from "@/components/addresses/address-labels";
import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import {
  formatPhMobileDisplay,
  normalizeOptionalPhMobileDb,
  parsePhMobileInput,
} from "@/lib/utils/ph-mobile";
import { writeMapAddressPickContext } from "@/lib/map/map-address-pick-storage";

type Mode = "create" | "edit";

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
}) {
  const { open, mode, initial, mapBootstrap = null, onClose, onSaved } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [labelType, setLabelType] = useState<UserAddressLabelType>("home");
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
  const [fullAddress, setFullAddress] = useState("");
  const [neighborhoodName, setNeighborhoodName] = useState("");
  const [useLife, setUseLife] = useState(true);
  const [useTrade, setUseTrade] = useState(true);
  const [useDel, setUseDel] = useState(true);
  const [defMaster, setDefMaster] = useState(false);
  const [defLife, setDefLife] = useState(false);
  const [defTrade, setDefTrade] = useState(false);
  const [defDel, setDefDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (mode === "edit" && initial) {
      setLabelType(initial.labelType);
      setNickname(initial.nickname ?? "");
      setRecipientName(initial.recipientName ?? "");
      setPhoneNumber(parsePhMobileInput(initial.phoneNumber ?? ""));
      setRegion(initial.appRegionId ?? "");
      setCity(initial.appCityId ?? "");
      setBarangay(initial.barangay ?? "");
      setCityMunicipality(initial.cityMunicipality ?? "");
      setProvince(initial.province ?? "");
      {
        const b = (initial.buildingName ?? "").trim();
        const s = (initial.streetAddress ?? "").trim();
        const merged = b && s ? `${b} ${s}`.trim() : b || s;
        setStreetAddress(merged);
        setUnitFloorRoom(initial.unitFloorRoom ?? "");
      }
      setLandmark(initial.landmark ?? "");
      if (mapBootstrap) {
        setLatitude(mapBootstrap.latitude);
        setLongitude(mapBootstrap.longitude);
        setFullAddress(mapBootstrap.fullAddress.trim());
        setUnitFloorRoom((mapBootstrap.addressDetail ?? "").trim());
      } else {
        setLatitude(initial.latitude ?? null);
        setLongitude(initial.longitude ?? null);
        setFullAddress(initial.fullAddress ?? "");
      }
      setNeighborhoodName(initial.neighborhoodName ?? "");
      setUseLife(initial.useForLife);
      setUseTrade(initial.useForTrade);
      setUseDel(initial.useForDelivery);
      setDefMaster(false);
      setDefLife(false);
      setDefTrade(false);
      setDefDel(false);
    } else if (mode === "create") {
      setLabelType("home");
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
      if (mapBootstrap) {
        setLatitude(mapBootstrap.latitude);
        setLongitude(mapBootstrap.longitude);
        setFullAddress(mapBootstrap.fullAddress.trim());
        const d = (mapBootstrap.addressDetail ?? "").trim();
        setUnitFloorRoom(d);
      } else {
        setLatitude(null);
        setLongitude(null);
        setFullAddress("");
      }
      setNeighborhoodName("");
      setUseLife(true);
      setUseTrade(true);
      setUseDel(true);
      setDefMaster(false);
      setDefLife(false);
      setDefTrade(false);
      setDefDel(false);
    }
  }, [open, mode, initial, mapBootstrap]);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setErr(null);
    const ph = normalizeOptionalPhMobileDb(phoneNumber);
    if (!ph.ok) {
      setErr(ph.error);
      setBusy(false);
      return;
    }
    try {
      if (latitude == null || longitude == null || !fullAddress.trim()) {
        setErr("지도에서 위치를 선택해 주세요.");
        setBusy(false);
        return;
      }
      const body = {
        labelType,
        nickname: nickname.trim() || null,
        recipientName: recipientName.trim() || null,
        phoneNumber: ph.value,
        appRegionId: region.trim() || null,
        appCityId: city.trim() || null,
        barangay: barangay.trim() || null,
        cityMunicipality: cityMunicipality.trim() || null,
        province: province.trim() || null,
        streetAddress: streetAddress.trim() || null,
        buildingName: null,
        unitFloorRoom: unitFloorRoom.trim() || null,
        landmark: landmark.trim() || null,
        latitude,
        longitude,
        fullAddress: fullAddress.trim() || null,
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
        setErr(typeof j.error === "string" ? j.error : "저장에 실패했어요.");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/40 sm:items-center sm:justify-center sm:p-4">
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[length:var(--ui-radius-rect)] bg-white sm:max-h-[90vh] sm:max-w-lg sm:rounded-ui-rect sm:shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="addr-editor-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-3 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 min-w-[44px] items-center justify-center rounded-ui-rect text-[14px] text-gray-600"
            aria-label="닫기"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <h2 id="addr-editor-title" className="text-[16px] font-semibold text-gray-900">
            주소상세
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="min-w-[52px] rounded-ui-rect px-2 py-1.5 text-[15px] font-semibold text-signature disabled:opacity-40"
          >
            {busy ? "…" : "저장"}
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-6">
          <div>
            <p className="mb-2 text-[14px] font-medium text-gray-900">이름</p>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Home"
              className="w-full border-0 border-b border-gray-200 bg-transparent py-2 text-[17px] text-gray-900 outline-none placeholder:text-gray-400"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => {
                writeMapAddressPickContext(
                  mode === "edit" && initial?.id
                    ? { source: "edit", addressId: initial.id }
                    : { source: "create" },
                );
                router.push("/address/select");
              }}
              className="w-full rounded-ui-rect bg-gray-100 py-4 text-[15px] font-medium text-gray-900"
            >
              위치 선택
            </button>
            {fullAddress.trim() || latitude != null ? (
              <p className="mt-3 text-[13px] leading-relaxed text-gray-600">
                {fullAddress.trim() ||
                  (latitude != null && longitude != null
                    ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                    : "")}
              </p>
            ) : (
              <p className="mt-3 text-[13px] text-amber-800">위치를 선택해 주세요.</p>
            )}
          </div>

          <details className="group rounded-ui-rect border border-gray-100 bg-gray-50 open:bg-white">
            <summary className="cursor-pointer list-none px-3 py-3 text-[14px] font-medium text-gray-800 [&::-webkit-details-marker]:hidden">
              상세 주소·배달 정보 (선택)
            </summary>
            <div className="space-y-4 border-t border-gray-100 px-3 pb-4 pt-2">
              <div>
                <p className="mb-1 text-[12px] font-medium text-gray-700">라벨 유형</p>
                <select
                  value={labelType}
                  onChange={(e) => setLabelType(e.target.value as UserAddressLabelType)}
                  className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[14px]"
                >
                  {(Object.keys(ADDRESS_LABEL_KO) as UserAddressLabelType[]).map((k) => (
                    <option key={k} value={k}>
                      {ADDRESS_LABEL_KO[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-[12px] font-medium text-gray-700">지번·건물 / 동·호</p>
                <p className="mb-2 text-[11px] text-gray-500">{STORE_ADDRESS_BOOK_STREET_BLOCK_INTRO}</p>
                <StoreAddressStreetDetailGrid
                  addressStreetLine={streetAddress}
                  addressDetail={unitFloorRoom}
                  onAddressStreetLineChange={setStreetAddress}
                  onAddressDetailChange={setUnitFloorRoom}
                  inputClassName="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2.5 text-[14px]"
                />
              </div>
              <div>
                <p className="mb-1 text-[12px] font-medium text-gray-700">동네 표시명</p>
                <input
                  value={neighborhoodName}
                  onChange={(e) => setNeighborhoodName(e.target.value)}
                  placeholder="Barangay 등"
                  className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2.5 text-[14px]"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[12px] font-medium text-gray-700">Province</p>
                  <input
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[14px]"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[12px] font-medium text-gray-700">City / Municipality</p>
                  <input
                    value={cityMunicipality}
                    onChange={(e) => setCityMunicipality(e.target.value)}
                    className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[14px]"
                  />
                </div>
              </div>
              <div>
                <p className="mb-1 text-[12px] font-medium text-gray-700">Barangay</p>
                <input
                  value={barangay}
                  onChange={(e) => setBarangay(e.target.value)}
                  className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[14px]"
                />
              </div>
              <div>
                <p className="mb-1 text-[12px] font-medium text-gray-700">Landmark</p>
                <input
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[14px]"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[12px] font-medium text-gray-700">수령인</p>
                  <input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[14px]"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[12px] font-medium text-gray-700">연락처</p>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={17}
                    value={formatPhMobileDisplay(phoneNumber)}
                    onChange={(e) => setPhoneNumber(parsePhMobileInput(e.target.value))}
                    placeholder={PH_MOBILE_PLACEHOLDER}
                    className="w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[14px]"
                  />
                </div>
              </div>
              <div className="rounded-ui-rect bg-white px-2 py-2">
                <p className="text-[12px] font-semibold text-gray-800">사용 용도</p>
                <label className="mt-2 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={useLife} onChange={(e) => setUseLife(e.target.checked)} />
                  생활 / 동네
                </label>
                <label className="mt-1 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={useTrade} onChange={(e) => setUseTrade(e.target.checked)} />
                  중고거래
                </label>
                <label className="mt-1 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={useDel} onChange={(e) => setUseDel(e.target.checked)} />
                  배달
                </label>
              </div>
              <div className="rounded-ui-rect border border-dashed border-gray-200 bg-white px-2 py-2">
                <p className="text-[12px] font-semibold text-gray-800">저장 시 기본값으로</p>
                <label className="mt-2 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={defMaster} onChange={(e) => setDefMaster(e.target.checked)} />
                  대표 주소
                </label>
                <label className="mt-1 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={defLife} onChange={(e) => setDefLife(e.target.checked)} />
                  생활 기본
                </label>
                <label className="mt-1 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={defTrade} onChange={(e) => setDefTrade(e.target.checked)} />
                  거래 기본
                </label>
                <label className="mt-1 flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={defDel} onChange={(e) => setDefDel(e.target.checked)} />
                  배달 기본
                </label>
              </div>
            </div>
          </details>

          {err ? <p className="text-[13px] text-red-600">{err}</p> : null}
        </div>
      </div>
    </div>
  );
}
