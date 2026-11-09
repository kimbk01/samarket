/** 매장 입점 신청 입력 규칙 — 화면·서버 공용 (서버 전용 import 금지) */
export const STORE_APPLY_LIMITS = {
  applicantMin: 2,
  applicantMax: 20,
  shopNameMin: 2,
  shopNameMax: 40,
  branchMax: 20,
  descriptionMax: 300,
  requestNoteMax: 1000,
  kakaoMax: 50,
} as const;

/** 앞뒤 공백 제거 + 연속 공백 1개 */
export function normalizeStoreApplyName(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

/** 본 이름 + 지점명 (지점명 없으면 본 이름) */
export function composeStoreNameWithBranch(base: string, branch: string | null | undefined): string {
  const b = normalizeStoreApplyName(branch ?? "");
  const n = normalizeStoreApplyName(base);
  return b ? `${n} ${b}` : n;
}

/** 어드민 표시용 — 지점명을 뗀 본 이름 */
export function storeBaseNameWithoutBranch(storeName: string, branch: string | null | undefined): string {
  const n = normalizeStoreApplyName(storeName);
  const b = normalizeStoreApplyName(branch ?? "");
  if (b && n.endsWith(` ${b}`)) return n.slice(0, n.length - b.length - 1);
  return n;
}
