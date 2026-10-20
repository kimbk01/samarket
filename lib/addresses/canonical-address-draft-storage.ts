import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";

const KEY = "dibay.address.platform.v2.draft";

/** 주소 검색(S2) 입력어 — 뒤로 돌아오면 유지 (S08), 저장 성공 시 제거 (UX-001) */
export const MYPAGE_ADDRESS_SEARCH_QUERY_SESSION_KEY = "dibay:mypage-address-search:q";

export function clearMypageAddressSearchQuery(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MYPAGE_ADDRESS_SEARCH_QUERY_SESSION_KEY);
  } catch {
    /* private mode */
  }
}

export type AddressPlatformV2DraftPayload = {
  draft: CanonicalAddressDraft;
  detail?: string | null;
  source: "search" | "current_location" | "pin";
};

function parseDraftPayload(raw: string | null): AddressPlatformV2DraftPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AddressPlatformV2DraftPayload;
    if (!parsed?.draft || typeof parsed.draft.latitude !== "number") return null;
    if (!Number.isFinite(parsed.draft.latitude) || !Number.isFinite(parsed.draft.longitude)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAddressPlatformV2Draft(payload: AddressPlatformV2DraftPayload): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

/** Non-destructive. Search → Detail remount/Strict Mode must not drop the draft. */
export function readAddressPlatformV2Draft(): AddressPlatformV2DraftPayload | null {
  if (typeof window === "undefined") return null;
  try {
    return parseDraftPayload(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearAddressPlatformV2Draft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Create Detail without a handoff draft must go back to Search — never because of remount. */
export function shouldRedirectCreateDetailToSearch(
  idFromUrl: string,
  mapBootstrap: boolean,
  draft: CanonicalAddressDraft | null,
): boolean {
  if (idFromUrl.trim() || mapBootstrap) return false;
  return !draft;
}

/* -------------------------------------------------------------------------- */
/* S3 편집 입력 초안 v3 — iOS 스와이프 뒤로·브라우저 뒤로 시 입력 보존 (UX-008)   */
/* v2 draft(검색 → 상세 handoff)와 별개 키. 로그아웃은 sessionStorage.clear().   */
/* -------------------------------------------------------------------------- */

export const ADDRESS_EDIT_DRAFT_V3_PREFIX = "dibay.address.edit.draft.v3:";
/** 복원 허용 시간 — 2시간 */
export const ADDRESS_EDIT_DRAFT_V3_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export type AddressEditDraftV3Fields = {
  detail: string;
  landmark: string;
  note: string;
  labelType: "home" | "office" | "other";
  nickname: string | null;
  isDefault: boolean;
};

export type AddressEditDraftV3 = {
  v: 3;
  userId: string;
  addressId: string;
  baseUpdatedAt: string | null;
  fields: AddressEditDraftV3Fields;
  savedAt: number;
};

export function buildAddressEditDraftV3Key(userId: string, addressId: string | null | undefined): string {
  return `${ADDRESS_EDIT_DRAFT_V3_PREFIX}${userId}:${addressId?.trim() || "new"}`;
}

export function writeAddressEditDraftV3(input: {
  userId: string;
  addressId: string | null | undefined;
  baseUpdatedAt: string | null;
  fields: AddressEditDraftV3Fields;
  now?: number;
}): void {
  if (typeof window === "undefined" || !input.userId) return;
  const addressId = input.addressId?.trim() || "new";
  const payload: AddressEditDraftV3 = {
    v: 3,
    userId: input.userId,
    addressId,
    baseUpdatedAt: input.baseUpdatedAt,
    fields: input.fields,
    savedAt: input.now ?? Date.now(),
  };
  try {
    sessionStorage.setItem(buildAddressEditDraftV3Key(input.userId, addressId), JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function clearAddressEditDraftV3(userId: string, addressId: string | null | undefined): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    sessionStorage.removeItem(buildAddressEditDraftV3Key(userId, addressId));
  } catch {
    /* ignore */
  }
}

/** 주소 삭제 성공 시 — 그 주소의 편집 초안 제거 */
export function clearAddressEditDraftV3ForAddress(addressId: string): void {
  if (typeof window === "undefined" || !addressId.trim()) return;
  const suffix = `:${addressId.trim()}`;
  try {
    const remove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(ADDRESS_EDIT_DRAFT_V3_PREFIX) && key.endsWith(suffix)) remove.push(key);
    }
    remove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * 같은 사용자·같은 주소·2시간 이내·(편집) 기준 updated_at 일치일 때만 반환.
 * 조건 불일치(만료·행 변경)면 키를 지우고 null.
 */
export function readAddressEditDraftV3(input: {
  userId: string;
  addressId: string | null | undefined;
  baseUpdatedAt: string | null;
  now?: number;
}): AddressEditDraftV3 | null {
  if (typeof window === "undefined" || !input.userId) return null;
  const addressId = input.addressId?.trim() || "new";
  const key = buildAddressEditDraftV3Key(input.userId, addressId);
  let parsed: AddressEditDraftV3 | null = null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    parsed = JSON.parse(raw) as AddressEditDraftV3;
  } catch {
    parsed = null;
  }
  const now = input.now ?? Date.now();
  const valid =
    parsed != null &&
    parsed.v === 3 &&
    parsed.userId === input.userId &&
    parsed.addressId === addressId &&
    typeof parsed.savedAt === "number" &&
    now - parsed.savedAt >= 0 &&
    now - parsed.savedAt < ADDRESS_EDIT_DRAFT_V3_MAX_AGE_MS &&
    typeof parsed.fields === "object" &&
    parsed.fields != null &&
    (addressId === "new" || parsed.baseUpdatedAt === input.baseUpdatedAt);
  if (!valid) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return null;
  }
  return parsed;
}
