"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserAddressDTO, UserAddressLabelType } from "@/lib/addresses/user-address-types";
import { normalizeOptionalPhMobileDb, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import { writeMapAddressPickContext } from "@/lib/map/map-address-pick-storage";
import { normalizeAddressNicknameKey } from "@/lib/addresses/address-nickname-key";
import { nextAutoUnspecifiedNickname } from "@/lib/addresses/unspecified-address-nickname";
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

  const fieldLabelClass = "mb-1.5 block text-[12px] font-semibold leading-4 text-sam-muted";
  const fieldInputClass =
    "w-full rounded-lg border border-sam-border bg-sam-app px-3 py-2.5 sam-text-body text-sam-fg outline-none transition-shadow placeholder:text-sam-muted focus-visible:border-sam-primary focus-visible:ring-2 focus-visible:ring-sam-primary/20";

  return (
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
            주소상세
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-sam-muted transition-colors hover:bg-sam-app hover:text-sam-fg"
            aria-label="닫기"
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {latitude != null && longitude != null ? (
            <>
              <div>
                <label htmlFor="addr-editor-nick" className={fieldLabelClass}>
                  지정 주소 이름
                </label>
                <input
                  id="addr-editor-nick"
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value);
                    setErr(null);
                  }}
                  placeholder="예: 집, 회사 (비우면 자동)"
                  autoComplete="off"
                  className={fieldInputClass}
                />
              </div>
              <div>
                <span className={fieldLabelClass}>지도에서 고른 위치</span>
                <p className="rounded-lg border border-sam-border bg-sam-app px-3 py-2.5 sam-text-body leading-relaxed text-sam-fg">
                  {fullAddress.trim() || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
                </p>
              </div>
              <div>
                <label htmlFor="addr-editor-detail" className={fieldLabelClass}>
                  상세주소
                </label>
                <input
                  id="addr-editor-detail"
                  value={unitFloorRoom}
                  onChange={(e) => setUnitFloorRoom(e.target.value)}
                  placeholder="지번, 건물명, 동·호 등"
                  autoComplete="off"
                  className={fieldInputClass}
                />
              </div>
              <div className="flex justify-center overflow-hidden rounded-lg border border-sam-border bg-sam-app">
                <AddressMapThumb lat={latitude} lng={longitude} sizePx={200} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="addr-editor-nick-empty" className={fieldLabelClass}>
                  지정 주소 이름
                </label>
                <input
                  id="addr-editor-nick-empty"
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value);
                    setErr(null);
                  }}
                  placeholder="예: 집, 회사 (비우면 자동)"
                  autoComplete="off"
                  className={fieldInputClass}
                />
              </div>
              <div>
                <label htmlFor="addr-editor-detail-empty" className={fieldLabelClass}>
                  상세주소
                </label>
                <input
                  id="addr-editor-detail-empty"
                  value={unitFloorRoom}
                  onChange={(e) => setUnitFloorRoom(e.target.value)}
                  placeholder="지번, 건물명, 동·호 등"
                  autoComplete="off"
                  className={fieldInputClass}
                />
              </div>
              <p className="rounded-lg border border-dashed border-sam-border bg-sam-app/60 px-3 py-2.5 text-center sam-text-body-secondary text-sam-muted">
                위치를 저장하려면 아래「위치 선택」에서 지도를 열어 주세요.
              </p>
            </>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-sam-border bg-sam-app/40 px-4 py-3 safe-area-pb">
          {err ? <p className="text-center sam-text-body-secondary font-medium text-sam-danger">{err}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
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
              className="w-full rounded-lg border border-sam-border bg-sam-surface py-2.5 sam-text-body font-semibold text-sam-fg shadow-sm transition-colors hover:bg-sam-app sm:w-auto sm:min-w-[100px] sm:px-4"
            >
              위치 선택
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="w-full rounded-lg bg-sam-primary py-2.5 sam-text-body font-semibold text-white shadow-sm transition-opacity hover:bg-sam-primary-hover disabled:opacity-40 sm:w-auto sm:min-w-[112px] sm:px-5"
            >
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
