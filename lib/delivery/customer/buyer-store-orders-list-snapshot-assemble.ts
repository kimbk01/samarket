/**
 * SOL1 buyer store orders list — CPU-only assemble (same shape as legacy GET).
 */
import {
  mapBuyerStoreOrderReviewRow,
  type BuyerStoreOrderReviewSummary,
} from "@/lib/stores/buyer-store-order-review-meta";
import { normalizeStoreOrderStatusForBuyer } from "@/lib/stores/normalize-store-order-status";

export type BuyerStoreOrdersListSnapshotPayloadJson = {
  ok?: boolean;
  error?: string;
  orders?: unknown[];
  next_cursor?: string | null;
  reviews_unavailable?: boolean;
  snapshot_version?: number;
  updated_at?: string;
};

export type BuyerStoreOrderListApiRow = Record<string, unknown> & {
  order_status: string;
  store_name: string;
  store_slug: string;
  store_profile_image_url: string | null;
  items: Record<string, unknown>[];
  has_review: boolean;
  review: BuyerStoreOrderReviewSummary | null;
  can_submit_review: boolean;
  review_status: string;
  order_chat_unread_count: number;
};

export function parseBuyerStoreOrdersListSnapshotRpcData(
  data: unknown
): BuyerStoreOrdersListSnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as BuyerStoreOrdersListSnapshotPayloadJson;
}

export function buyerStoreOrdersListSnapshotGateFromPayload(
  payload: BuyerStoreOrdersListSnapshotPayloadJson
): { ok: true; reviewsUnavailable: boolean } | { ok: false; error: string; status: number } {
  if (payload.ok === false) {
    const err = String(payload.error ?? "forbidden");
    return { ok: false, error: err, status: err === "unauthorized" ? 401 : 500 };
  }
  if (payload.ok !== true) return { ok: false, error: "invalid_snapshot", status: 500 };
  return { ok: true, reviewsUnavailable: payload.reviews_unavailable === true };
}

export function buyerStoreOrdersListFromPayload(
  payload: BuyerStoreOrdersListSnapshotPayloadJson
): BuyerStoreOrderListApiRow[] {
  const reviewsUnavailable = payload.reviews_unavailable === true;
  if (!Array.isArray(payload.orders)) return [];
  return payload.orders
    .filter((o) => o && typeof o === "object")
    .map((raw) => {
      const o = raw as Record<string, unknown>;
      const id = String(o.id ?? "").trim();
      const norm = normalizeStoreOrderStatusForBuyer(o.order_status);
      const status = norm || String(o.order_status ?? "").trim() || "pending";
      const buyerReview = mapBuyerStoreOrderReviewRow(
        (o.review as Record<string, unknown> | null | undefined) ?? null
      );
      const completed = status === "completed";
      const canSubmitReview = completed && !buyerReview && !reviewsUnavailable;
      const { review: _dropReview, items: rawItems, ...orderRest } = o;
      const items = Array.isArray(rawItems)
        ? (rawItems as Record<string, unknown>[])
        : [];
      return {
        ...orderRest,
        id,
        order_status: status,
        store_name: String(o.store_name ?? ""),
        store_slug: String(o.store_slug ?? ""),
        store_profile_image_url:
          typeof o.store_profile_image_url === "string" && o.store_profile_image_url.trim()
            ? o.store_profile_image_url.trim()
            : null,
        items,
        has_review: !!buyerReview,
        review: buyerReview,
        can_submit_review: canSubmitReview,
        review_status: completed
          ? buyerReview
            ? "completed"
            : reviewsUnavailable
              ? "unavailable"
              : "pending"
          : "not_applicable",
        order_chat_unread_count: Math.max(
          0,
          Math.floor(Number(o.order_chat_unread_count ?? 0) || 0)
        ),
      } as BuyerStoreOrderListApiRow;
    });
}

export function buildBuyerStoreOrdersListResponseBody(orders: BuyerStoreOrderListApiRow[]): {
  ok: true;
  orders: BuyerStoreOrderListApiRow[];
} {
  return { ok: true, orders };
}
