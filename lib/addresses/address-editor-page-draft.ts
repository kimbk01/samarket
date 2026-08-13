/**
 * `/mypage/addresses/edit` ↔ `/mypage/addresses/fine-tune` 왕복 SSOT.
 *
 * CONTRACT:
 * - draft / fineTune result 는 **peek 전용**. hydrate 에서 consume/clear 금지.
 * - Apply 시 fine-tune 결과를 draft 에 병합(mapPinConfirmed=true) 후 navigate.
 * - clear 는 주소록 목록 진입·저장 성공 시에만.
 *
 * WHY: address-book dual-panel push 가 edit 트리를 2회 마운트한다.
 * 첫 마운트에서 consume 하면 두 번째 마운트는 빈 폼이 된다.
 */

import type { ReverseGeocodePhResult } from "@/lib/addresses/reverse-geocode-ph-client";

export const ADDRESS_EDITOR_PAGE_DRAFT_KEY = "samarket:addressEditorPageDraft:v1";
export const ADDRESS_FINE_TUNE_INTENT_KEY = "samarket:addressFineTuneIntent:v1";
export const ADDRESS_FINE_TUNE_RESULT_KEY = "samarket:addressFineTuneResult:v1";

export type AddressEditorPageDraftV1 = {
  v: 1;
  mode: "create" | "edit";
  addressId: string | null;
  returnTo: string;
  nickname: string;
  recipientName: string;
  phoneNumber: string;
  region: string;
  city: string;
  barangay: string;
  cityMunicipality: string;
  province: string;
  streetAddress: string;
  unitFloorRoom: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string;
  formattedAddress: string;
  roadAddress: string;
  fullAddress: string;
  neighborhoodName: string;
  buildingName: string;
  mapPinConfirmed: boolean;
  search: string;
  useLife: boolean;
  useTrade: boolean;
  useDel: boolean;
  defMaster: boolean;
  defLife: boolean;
  defTrade: boolean;
  defDel: boolean;
  labelPreset: null | "home" | "shop" | "office" | "custom";
  selectedStoreId: string;
  selectionAnchorSearch: string | null;
};

export type AddressFineTuneIntentV1 = {
  v: 1;
  latitude: number;
  longitude: number;
  editHref: string;
};

function safeParseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeAddressEditorPageDraft(draft: AddressEditorPageDraftV1): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ADDRESS_EDITOR_PAGE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota */
  }
}

export function peekAddressEditorPageDraft(): AddressEditorPageDraftV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ADDRESS_EDITOR_PAGE_DRAFT_KEY);
    const parsed = safeParseJson(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const d = parsed as AddressEditorPageDraftV1;
    if (d.v !== 1) return null;
    return d;
  } catch {
    return null;
  }
}

/** @deprecated hydrate 에서 쓰지 말 것 — peek + 목록 진입 clear 만 */
export function consumeAddressEditorPageDraft(): AddressEditorPageDraftV1 | null {
  const d = peekAddressEditorPageDraft();
  clearAddressEditorPageDraft();
  return d;
}

export function clearAddressEditorPageDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ADDRESS_EDITOR_PAGE_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function writeAddressFineTuneIntent(intent: AddressFineTuneIntentV1): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ADDRESS_FINE_TUNE_INTENT_KEY, JSON.stringify(intent));
  } catch {
    /* quota */
  }
}

export function consumeAddressFineTuneIntent(): AddressFineTuneIntentV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ADDRESS_FINE_TUNE_INTENT_KEY);
    sessionStorage.removeItem(ADDRESS_FINE_TUNE_INTENT_KEY);
    const parsed = safeParseJson(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const d = parsed as AddressFineTuneIntentV1;
    if (d.v !== 1) return null;
    if (!Number.isFinite(d.latitude) || !Number.isFinite(d.longitude)) return null;
    if (!d.editHref?.startsWith("/") || d.editHref.startsWith("//")) return null;
    return d;
  } catch {
    return null;
  }
}

export function peekAddressFineTuneIntent(): AddressFineTuneIntentV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ADDRESS_FINE_TUNE_INTENT_KEY);
    const parsed = safeParseJson(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const d = parsed as AddressFineTuneIntentV1;
    if (d.v !== 1) return null;
    if (!Number.isFinite(d.latitude) || !Number.isFinite(d.longitude)) return null;
    if (!d.editHref?.startsWith("/") || d.editHref.startsWith("//")) return null;
    return d;
  } catch {
    return null;
  }
}

export function writeAddressFineTuneResult(result: ReverseGeocodePhResult): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ADDRESS_FINE_TUNE_RESULT_KEY, JSON.stringify({ v: 1, result }));
  } catch {
    /* quota */
  }
}

function parseFineTuneResultWrap(raw: string | null): ReverseGeocodePhResult | null {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const wrap = parsed as { v?: number; result?: ReverseGeocodePhResult };
  if (wrap.v !== 1 || !wrap.result) return null;
  const r = wrap.result;
  if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return null;
  if (!(r.placeId ?? "").trim()) return null;
  if (!(r.formattedAddress ?? "").trim()) return null;
  return r;
}

export function peekAddressFineTuneResult(): ReverseGeocodePhResult | null {
  if (typeof window === "undefined") return null;
  try {
    return parseFineTuneResultWrap(sessionStorage.getItem(ADDRESS_FINE_TUNE_RESULT_KEY));
  } catch {
    return null;
  }
}

export function clearAddressFineTuneResult(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ADDRESS_FINE_TUNE_RESULT_KEY);
  } catch {
    /* ignore */
  }
}

/** @deprecated hydrate 에서 쓰지 말 것 */
export function consumeAddressFineTuneResult(): ReverseGeocodePhResult | null {
  const r = peekAddressFineTuneResult();
  clearAddressFineTuneResult();
  return r;
}

export function clearAddressEditorSession(): void {
  clearAddressEditorPageDraft();
  clearAddressFineTuneResult();
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ADDRESS_FINE_TUNE_INTENT_KEY);
  } catch {
    /* ignore */
  }
}

export function hasAddressEditorSessionRestore(): boolean {
  return peekAddressEditorPageDraft() != null || peekAddressFineTuneResult() != null;
}

/**
 * 미세조정 「이 위치로 반영」— draft 에 확정 좌표·건물명·placeId 를 병합한다.
 * navigate 전 호출. remount 가 여러 번이어도 peek draft 만으로 복구 가능.
 */
export function mergeFineTuneResultIntoEditorDraft(
  r: ReverseGeocodePhResult,
  opts?: { returnTo?: string; mode?: "create" | "edit"; addressId?: string | null },
): AddressEditorPageDraftV1 {
  const prev = peekAddressEditorPageDraft();
  const ph = r.parsed;
  const headLine = r.formattedAddress.split(",")[0]?.trim() ?? "";
  const nextStreet = (ph.routeLine || headLine).trim();
  const nextBuilding =
    (ph.buildingOrPlaceHeadline ?? "").trim() ||
    (r.buildingOrPlaceNames?.[0] ?? "").trim() ||
    "";
  const formatted = r.formattedAddress.trim();
  const placeId = (r.placeId ?? "").trim();
  const next: AddressEditorPageDraftV1 = {
    v: 1,
    mode: prev?.mode ?? opts?.mode ?? "create",
    addressId: prev?.addressId ?? opts?.addressId ?? null,
    returnTo: prev?.returnTo ?? opts?.returnTo ?? "",
    nickname: prev?.nickname ?? "",
    recipientName: prev?.recipientName ?? "",
    phoneNumber: prev?.phoneNumber ?? "",
    region: prev?.region ?? "",
    city: prev?.city ?? "",
    barangay: (ph.barangay ?? prev?.barangay ?? "").trim(),
    cityMunicipality: (ph.cityMunicipality ?? prev?.cityMunicipality ?? "").trim(),
    province: (ph.province ?? prev?.province ?? "").trim(),
    streetAddress: nextStreet,
    unitFloorRoom: prev?.unitFloorRoom ?? "",
    landmark: prev?.landmark ?? "",
    latitude: r.latitude,
    longitude: r.longitude,
    placeId,
    formattedAddress: formatted,
    roadAddress: formatted,
    fullAddress: formatted,
    neighborhoodName: (ph.neighborhood ?? prev?.neighborhoodName ?? "").trim(),
    buildingName: nextBuilding,
    mapPinConfirmed: true,
    search: formatted,
    useLife: prev?.useLife ?? true,
    useTrade: prev?.useTrade ?? true,
    useDel: prev?.useDel ?? true,
    defMaster: prev?.defMaster ?? false,
    defLife: prev?.defLife ?? false,
    defTrade: prev?.defTrade ?? false,
    defDel: prev?.defDel ?? false,
    labelPreset: prev?.labelPreset ?? "home",
    selectedStoreId: prev?.selectedStoreId ?? "",
    selectionAnchorSearch: formatted.length >= 2 ? formatted : null,
  };
  writeAddressEditorPageDraft(next);
  writeAddressFineTuneResult(r);
  return next;
}
