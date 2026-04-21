"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserAddressDTO, UserAddressLabelType } from "@/lib/addresses/user-address-types";
import { normalizeOptionalPhMobileDb, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import { writeMapAddressPickContext } from "@/lib/map/map-address-pick-storage";
import { normalizeAddressNicknameKey } from "@/lib/addresses/address-nickname-key";
import { nextAutoUnspecifiedNickname } from "@/lib/addresses/unspecified-address-nickname";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";

type Mode = "create" | "edit";

/**
 * 작은 위치 미리보기 — Google Static Maps 는 Maps Static API·리퍼러 허용이 필요해 로컬에서 자주 깨짐.
 * 실패 시 OpenStreetMap 정적 타일(키 불필요)로 폴백.
 */
function AddressMapThumb({ lat, lng, sizePx = 72 }: { lat: number; lng: number; sizePx?: number }) {
  const gkey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const apiSize = Math.min(640, Math.max(128, Math.round(sizePx * 2)));
  const mapDim = `${apiSize}x${apiSize}`;
  const candidates = useMemo(() => {
    const q = [
      ...(gkey
        ? [
            `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=17&size=${mapDim}&scale=2&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${gkey}`,
          ]
        : []),
      `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=17&size=${mapDim}&maptype=mapnik&markers=${lat},${lng},lightblue1`,
    ];
    return q;
  }, [gkey, lat, lng, mapDim]);

  const [i, setI] = useState(0);
  const src = candidates[i];

  if (!src || i >= candidates.length) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-ui-rect bg-sam-surface-muted sam-text-xxs text-sam-meta"
        style={{ width: sizePx, height: sizePx }}
        aria-hidden
      >
        지도
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 외부 정적 지도 URL
    <img
      key={i}
      src={src}
      alt=""
      width={sizePx}
      height={sizePx}
      className="shrink-0 rounded-ui-rect object-cover bg-sam-surface-muted"
      style={{ width: sizePx, height: sizePx }}
      loading="lazy"
      decoding="async"
      onError={() => setI((x) => x + 1)}
    />
  );
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
}) {
  const { open, mode, initial, mapBootstrap = null, onClose, onSaved, allAddresses = [] } = props;
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
        setUnitFloorRoom((mapBootstrap.addressDetail ?? "").trim());
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
    const siblingRows = allAddresses.filter((a) => !(mode === "edit" && initial?.id === a.id));
    const resolvedName = nickname.trim()
      ? nickname.trim()
      : nextAutoUnspecifiedNickname(siblingRows.map((a) => a.nickname ?? ""));
    const nameKey = normalizeAddressNicknameKey(resolvedName);
    const dup = siblingRows.some(
      (a) => normalizeAddressNicknameKey(a.nickname ?? "") === nameKey,
    );
    if (dup) {
      setErr("이미 같은 지정 주소가 있어요.");
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
        nickname: resolvedName,
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3 sm:p-4 md:p-6">
      <div
        className={`flex max-h-[min(90dvh,92vh)] w-full min-w-0 flex-col overflow-hidden rounded-ui-rect bg-sam-surface text-sam-fg shadow-xl ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="addr-editor-title"
      >
        <div className="relative flex shrink-0 items-center justify-center border-b border-sam-primary-border/50 bg-sam-primary-soft px-3 py-3.5">
          <h2
            id="addr-editor-title"
            className="sam-text-section-title font-semibold tracking-tight text-signature"
          >
            주소상세
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-1 top-1/2 flex h-10 min-w-[44px] -translate-y-1/2 items-center justify-center rounded-ui-rect text-sam-icon-soft transition-colors hover:bg-white/60 hover:text-signature"
            aria-label="닫기"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-sam-app/80 px-4 py-4 sm:bg-sam-surface sm:py-5">
          {latitude != null && longitude != null ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto_auto] gap-x-3 gap-y-2.5">
              <div className="col-start-1 row-start-1 flex min-w-0 flex-nowrap items-center gap-2.5">
                <span className="shrink-0 sam-text-body-secondary font-semibold text-signature/90">지정 주소</span>
                <input
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value);
                    setErr(null);
                  }}
                  placeholder="비우면 지정안함 입력됨"
                  autoComplete="off"
                  className="min-w-0 flex-1 border-0 border-b-2 border-neutral-400/90 bg-transparent py-1.5 sam-text-body text-sam-fg outline-none transition-colors placeholder:text-sam-muted placeholder:sam-text-body-secondary focus-visible:border-signature"
                />
              </div>
              <p className="col-start-1 row-start-2 min-w-0 self-start sam-text-body leading-relaxed text-sam-muted">
                {fullAddress.trim() ||
                  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
              </p>
              <div className="col-start-1 row-start-3 flex min-w-0 flex-nowrap items-center gap-2.5">
                <span className="shrink-0 sam-text-body-secondary font-semibold text-signature/90">상세주소</span>
                <input
                  value={unitFloorRoom}
                  onChange={(e) => setUnitFloorRoom(e.target.value)}
                  placeholder="지번, 건물명, 동·호 등"
                  className="min-w-0 flex-1 border-0 border-b-2 border-neutral-400/90 bg-transparent py-1.5 sam-text-body text-sam-fg outline-none transition-colors placeholder:text-sam-muted focus-visible:border-signature"
                />
              </div>
              <div className="col-start-2 row-span-3 row-start-1 self-start justify-self-end rounded-ui-rect p-0.5 ring-1 ring-sam-primary-border/60">
                <AddressMapThumb lat={latitude} lng={longitude} sizePx={120} />
              </div>
            </div>
          ) : (
            <>
              <div className="flex min-w-0 flex-nowrap items-center gap-2.5">
                <span className="shrink-0 sam-text-body-secondary font-semibold text-signature/90">지정 주소</span>
                <input
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value);
                    setErr(null);
                  }}
                  placeholder="비우면 지정안함 입력됨"
                  autoComplete="off"
                  className="min-w-0 flex-1 border-0 border-b-2 border-neutral-400/90 bg-transparent py-1.5 sam-text-body text-sam-fg outline-none transition-colors placeholder:text-sam-muted placeholder:sam-text-body-secondary focus-visible:border-signature"
                />
              </div>
              <div className="flex min-w-0 flex-nowrap items-center gap-2.5">
                <span className="shrink-0 sam-text-body-secondary font-semibold text-signature/90">상세주소</span>
                <input
                  value={unitFloorRoom}
                  onChange={(e) => setUnitFloorRoom(e.target.value)}
                  placeholder="지번, 건물명, 동·호 등"
                  className="min-w-0 flex-1 border-0 border-b-2 border-neutral-400/90 bg-transparent py-1.5 sam-text-body text-sam-fg outline-none transition-colors placeholder:text-sam-muted focus-visible:border-signature"
                />
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-sam-primary-border/35 bg-sam-primary-soft/40 px-4 py-3 safe-area-pb">
          {err ? <p className="sam-text-body-secondary font-medium text-red-600">{err}</p> : null}
          <div className="flex gap-2.5">
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
              className="flex-1 rounded-ui-rect border border-sam-primary-border bg-white py-3 sam-text-body font-semibold text-signature shadow-sm transition-colors hover:bg-sam-primary-soft"
            >
              위치 선택
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="flex-1 rounded-ui-rect bg-signature py-3 sam-text-body font-semibold text-white shadow-sm transition-opacity hover:bg-signature/90 disabled:opacity-40"
            >
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
