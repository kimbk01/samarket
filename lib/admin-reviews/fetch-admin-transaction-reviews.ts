import type { AdminReview } from "@/lib/types/admin-review";

export class AdminReviewFetchError extends Error {
  readonly status: number;
  /** 서버 오류 코드 (없으면 http_<status>) — 화면은 오류 맵으로만 표시 */
  readonly code: string;

  constructor(status: number, code?: string) {
    super(`admin transaction reviews fetch failed: ${status}`);
    this.status = status;
    this.code = code || `http_${status}`;
  }
}

export type AdminReviewListQuery = {
  /** 20 | 50 | 100 */
  limit: number;
  offset: number;
  reviewStatus?: string;
  rating?: string;
  role?: string;
  q?: string;
};

/** 서버 페이지 목록 — 조건·쪽은 서버가 적용하고 총 건수를 돌려준다. */
export async function fetchAdminTransactionReviewsPage(
  query: AdminReviewListQuery
): Promise<{ reviews: AdminReview[]; total: number }> {
  let res: Response;
  try {
    res = await fetch("/api/admin/transaction-reviews", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
  } catch {
    throw new AdminReviewFetchError(0, "network_error");
  }
  const data = (await res.json().catch(() => ({}))) as { reviews?: AdminReview[]; total?: number; error?: string };
  if (!res.ok) throw new AdminReviewFetchError(res.status, typeof data.error === "string" ? data.error : undefined);
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  return { reviews, total: typeof data.total === "number" ? data.total : reviews.length };
}

export async function fetchAdminTransactionReviewsList(): Promise<AdminReview[]> {
  const res = await fetch("/api/admin/transaction-reviews", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new AdminReviewFetchError(res.status);
  const data = (await res.json()) as { reviews?: AdminReview[] };
  return Array.isArray(data.reviews) ? data.reviews : [];
}

export async function fetchAdminTransactionReviewOne(reviewId: string): Promise<AdminReview | null> {
  const res = await fetch("/api/admin/transaction-reviews", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewId }),
  });
  if (!res.ok) throw new AdminReviewFetchError(res.status);
  const data = (await res.json()) as { review?: AdminReview | null };
  return data.review ?? null;
}
