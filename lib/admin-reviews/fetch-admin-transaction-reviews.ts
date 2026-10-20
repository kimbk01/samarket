import type { AdminReview } from "@/lib/types/admin-review";

export class AdminReviewFetchError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`admin transaction reviews fetch failed: ${status}`);
    this.status = status;
  }
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
