/**
 * `/stores/owner/apply` — 주소록 왕복 시 작성 중 폼 유지.
 * 거래 글쓰기 `trade-write-address-return-flag` 와 동일 목적(session 1회 복원).
 */

const KEY = "samarket:business-apply-form-draft:v1";

/** `BusinessApplyFormValues` 와 동일 형상 — 컴포넌트 순환 import 방지 */
export type BusinessApplySessionDraftValues = {
  applicantNickname: string;
  shopName: string;
  description: string;
  requestNote: string;
  phone: string;
  kakaoId: string;
  region: string;
  city: string;
  addressStreetLine: string;
  addressDetail: string;
  categoryPrimarySlug: string;
  categorySubSlug: string;
};

export type BusinessApplySessionDraft = {
  values: BusinessApplySessionDraftValues;
  regionId: string;
  cityId: string;
};

function isDraft(raw: unknown): raw is BusinessApplySessionDraft {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as BusinessApplySessionDraft;
  return o.values != null && typeof o.values === "object";
}

export function writeBusinessApplySessionDraft(draft: BusinessApplySessionDraft): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function peekBusinessApplySessionDraft(): BusinessApplySessionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** true 이면 플래그를 제거했다(이번 마운트에서 복원). */
export function consumeBusinessApplySessionDraft(): BusinessApplySessionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as unknown;
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearBusinessApplySessionDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
