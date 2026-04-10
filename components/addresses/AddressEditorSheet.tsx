"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserAddressDTO, UserAddressLabelType } from "@/lib/addresses/user-address-types";
import { consumeMapAddressPick } from "@/lib/map/map-address-pick-storage";
import { StoreAddressStreetDetailGrid } from "@/components/stores/StoreAddressStreetDetailGrid";
import { STORE_ADDRESS_BOOK_STREET_BLOCK_INTRO } from "@/lib/stores/store-address-form-ui";
import { ADDRESS_LABEL_KO } from "@/components/addresses/address-labels";
import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import {
  formatPhMobileDisplay,
  normalizeOptionalPhMobileDb,
  parsePhMobileInput,
} from "@/lib/utils/ph-mobile";

type Mode = "create" | "edit";

export function AddressEditorSheet(props: {
  open: boolean;
  mode: Mode;
  initial: UserAddressDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { open, mode, initial, onClose, onSaved } = props;
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
      setLatitude(initial.latitude ?? null);
      setLongitude(initial.longitude ?? null);
      setFullAddress(initial.fullAddress ?? "");
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
      setLatitude(null);
      setLongitude(null);
      setFullAddress("");
      setNeighborhoodName("");
      setUseLife(true);
      setUseTrade(true);
      setUseDel(true);
      setDefMaster(false);
      setDefLife(false);
      setDefTrade(false);
      setDefDel(false);
    }
  }, [open, mode, initial]);

  useEffect(() => {
    if (!open) return;
    const pick = consumeMapAddressPick();
    if (!pick) return;
    setLatitude(pick.latitude);
    setLongitude(pick.longitude);
    setFullAddress(pick.fullAddress);
  }, [open]);

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
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[length:var(--ui-radius-rect)] bg-white sm:max-h-[90vh] sm:max-w-lg sm:rounded-ui-rect sm:shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="addr-editor-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <h2 id="addr-editor-title" className="text-[16px] font-semibold text-gray-900">
            {mode === "create" ? "주소 추가" : "주소 수정"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect px-2 py-1 text-[13px] text-gray-500"
          >
            닫기
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 pb-28">
          <div>
            <p className="mb-1 text-[13px] font-medium text-gray-800">라벨</p>
            <select
              value={labelType}
              onChange={(e) => setLabelType(e.target.value as UserAddressLabelType)}
              className="w-full rounded-ui-rect border border-gray-200 px-3 py-2.5 text-[14px]"
            >
              {(Object.keys(ADDRESS_LABEL_KO) as UserAddressLabelType[]).map((k) => (
                <option key={k} value={k}>
                  {ADDRESS_LABEL_KO[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-[13px] font-medium text-gray-800">별칭 (선택)</p>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="예: 케손 집, BGC 사무실"
              className="w-full rounded-ui-rect border border-gray-200 px-3 py-2.5 text-[14px]"
            />
          </div>

          <div>
            <p className="mb-1 text-[13px] font-medium text-gray-800">지도 위치</p>
            <p className="mb-2 text-[12px] text-gray-500">
              Google 지도에서 핀으로 좌표를 고르고, 아래에 지오코딩된 주소가 저장됩니다.
            </p>
            <button
              type="button"
              onClick={() => router.push("/address/select")}
              className="w-full rounded-ui-rect border border-ig-border bg-white py-3 text-[14px] font-medium text-gray-900"
            >
              위치 선택
            </button>
            {fullAddress.trim() || latitude != null ? (
              <p className="mt-2 text-[13px] leading-snug text-gray-700">
                {fullAddress.trim() ||
                  (latitude != null && longitude != null
                    ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                    : "")}
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-amber-800">지도에서 위치를 선택해 주세요.</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-[13px] font-medium text-gray-800">지번·건물 / 동·호 (매장·프로필과 동일)</p>
            <p className="mb-2 text-[12px] text-gray-500">{STORE_ADDRESS_BOOK_STREET_BLOCK_INTRO}</p>
            <StoreAddressStreetDetailGrid
              addressStreetLine={streetAddress}
              addressDetail={unitFloorRoom}
              onAddressStreetLineChange={setStreetAddress}
              onAddressDetailChange={setUnitFloorRoom}
              inputClassName="w-full rounded-ui-rect border border-gray-200 px-3 py-2.5 text-[14px]"
            />
          </div>

          <div>
            <p className="mb-1 text-[13px] font-medium text-gray-800">동네 표시명 (거래·커뮤 노출용)</p>
            <input
              value={neighborhoodName}
              onChange={(e) => setNeighborhoodName(e.target.value)}
              placeholder="Barangay 또는 노출용 한 줄"
              className="w-full rounded-ui-rect border border-gray-200 px-3 py-2.5 text-[14px]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[12px] font-medium text-gray-700">Province</p>
              <input
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px]"
              />
            </div>
            <div>
              <p className="mb-1 text-[12px] font-medium text-gray-700">City / Municipality</p>
              <input
                value={cityMunicipality}
                onChange={(e) => setCityMunicipality(e.target.value)}
                className="w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px]"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-[12px] font-medium text-gray-700">Barangay</p>
            <input
              value={barangay}
              onChange={(e) => setBarangay(e.target.value)}
              className="w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px]"
            />
          </div>

          <div>
            <p className="mb-1 text-[12px] font-medium text-gray-700">Landmark</p>
            <input
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              className="w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[12px] font-medium text-gray-700">수령인 (배달)</p>
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px]"
              />
            </div>
            <div>
              <p className="mb-1 text-[12px] font-medium text-gray-700">연락처 (배달)</p>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={17}
                value={formatPhMobileDisplay(phoneNumber)}
                onChange={(e) => setPhoneNumber(parsePhMobileInput(e.target.value))}
                placeholder={PH_MOBILE_PLACEHOLDER}
                className="w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px]"
              />
            </div>
          </div>

          <div className="rounded-ui-rect bg-gray-50 px-3 py-3">
            <p className="text-[12px] font-semibold text-gray-800">사용 용도</p>
            <label className="mt-2 flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={useLife} onChange={(e) => setUseLife(e.target.checked)} />
              생활 / 동네 · 커뮤니티
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

          <div className="rounded-ui-rect border border-dashed border-gray-200 px-3 py-3">
            <p className="text-[12px] font-semibold text-gray-800">저장 시 기본값으로 지정</p>
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
            <p className="mt-2 text-[11px] text-gray-500">
              수정 화면에서 체크한 항목만 그때 기본값으로 바뀝니다.
            </p>
          </div>

          {err ? <p className="text-[13px] text-red-600">{err}</p> : null}
        </div>

        <div className="sticky bottom-0 border-t border-gray-100 bg-white px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="w-full rounded-ui-rect bg-signature py-3 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
