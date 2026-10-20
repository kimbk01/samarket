/**
 * 매장 문의 내역(S34) 행 규칙 — 순수 함수.
 * - 답변 상태 뱃지: 답변 대기(open·escalated) = `sam-warning-soft`, 답변 완료(answered·closed) = `sam-success-soft`.
 * - 행 목적지: 구매자용 문의 상세 경로는 없으므로 매장 화면 `/stores/{store_slug}` (A10). slug 없으면 링크 없음.
 */
export type StoreInquiryStatusTone = "waiting" | "done";

export function storeInquiryStatusTone(status: string | null | undefined): StoreInquiryStatusTone {
  const s = String(status ?? "").trim();
  return s === "answered" || s === "closed" ? "done" : "waiting";
}

export function storeInquiryStatusBadgeClass(status: string | null | undefined): string {
  return storeInquiryStatusTone(status) === "done"
    ? "bg-sam-success-soft text-sam-success"
    : "bg-sam-warning-soft text-sam-warning";
}

export function storeInquiryRowHref(storeSlug: string | null | undefined): string | null {
  const slug = String(storeSlug ?? "").trim();
  return slug ? `/stores/${encodeURIComponent(slug)}` : null;
}

/** 펼친 행 id 복원 (sessionStorage, 화면 단위) */
const EXPANDED_KEY = "dibay:mypage-store-inquiries:expanded";

export function readStoreInquiryExpandedIds(): string[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(EXPANDED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function writeStoreInquiryExpandedIds(ids: readonly string[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(EXPANDED_KEY, JSON.stringify([...ids].slice(0, 100)));
  } catch {
    /* quota */
  }
}
