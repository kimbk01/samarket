import type { AdminReview } from "@/lib/types/admin-review";

export async function fetchAdminTransactionReviewsList(): Promise<AdminReview[]> {
  const res = await fetch("/api/admin/transaction-reviews", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) return [];
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
  if (!res.ok) return null;
  const data = (await res.json()) as { review?: AdminReview | null };
  return data.review ?? null;
}
