/**
 * `/mypage/addresses/edit` ↔ `/mypage/addresses/fine-tune` 왕복 시
 * AddressEditorSheet 폼 상태 보존 (페이지 언마운트 대비).
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

export function consumeAddressEditorPageDraft(): AddressEditorPageDraftV1 | null {
  const d = peekAddressEditorPageDraft();
  if (typeof window === "undefined") return d;
  try {
    sessionStorage.removeItem(ADDRESS_EDITOR_PAGE_DRAFT_KEY);
  } catch {
    /* ignore */
  }
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

export function consumeAddressFineTuneResult(): ReverseGeocodePhResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ADDRESS_FINE_TUNE_RESULT_KEY);
    sessionStorage.removeItem(ADDRESS_FINE_TUNE_RESULT_KEY);
    const parsed = safeParseJson(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const wrap = parsed as { v?: number; result?: ReverseGeocodePhResult };
    if (wrap.v !== 1 || !wrap.result?.placeId) return null;
    return wrap.result;
  } catch {
    return null;
  }
}
