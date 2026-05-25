/**
 * SOD1 store order detail — CPU-only assemble + shared buyer GET body builder.
 */
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import {
  mapBuyerStoreOrderReviewRow,
  type BuyerStoreOrderReviewSummary,
} from "@/lib/stores/buyer-store-order-review-meta";

export type StoreOrderDetailSnapshotPayloadJson = {
  ok?: boolean;
  error?: string;
  order?: Record<string, unknown>;
  items?: unknown[];
  store?: Record<string, unknown>;
  delivery?: Record<string, unknown> | null;
  review?: Record<string, unknown> | null;
  payment?: Record<string, unknown>;
  refund?: Record<string, unknown>;
  rider?: Record<string, unknown> | null;
  timeline?: unknown[];
  unread_snapshot?: { unread_count?: number };
  snapshot_version?: number;
  updated_at?: string;
};

export type BuyerStoreOrderDetailGateData = {
  order: Record<string, unknown>;
  items: Record<string, unknown>[];
  store: Record<string, unknown>;
  delivery: Record<string, unknown> | null;
  review: BuyerStoreOrderReviewSummary | null;
  reviewsUnavailable: boolean;
};

/** 구매자 노출: 증빙 이미지 URL 제외·수령자 이름 마스킹 */
export function sanitizeBuyerDeliveryPublic(
  raw: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!raw) return null;
  const name =
    typeof raw.delivered_receiver_name === "string" ? raw.delivered_receiver_name.trim() : "";
  const hint =
    name.length === 0 ? null : name.length <= 2 ? `${name.slice(0, 1)}*` : `${name.slice(0, 1)}**`;
  const { delivered_receiver_name: _drop, ...rest } = raw;
  return {
    ...rest,
    delivered_receiver_hint: hint,
  };
}

export function parseStoreOrderDetailSnapshotRpcData(
  data: unknown
): StoreOrderDetailSnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as StoreOrderDetailSnapshotPayloadJson;
}

export function storeOrderDetailSnapshotGateFromPayload(
  payload: StoreOrderDetailSnapshotPayloadJson
): { ok: true; data: BuyerStoreOrderDetailGateData } | { ok: false; error: string; status: number } {
  if (payload.ok === false) {
    const err = String(payload.error ?? "not_found");
    return { ok: false, error: err, status: err === "not_found" ? 404 : 500 };
  }
  if (payload.ok !== true || !payload.order) {
    return { ok: false, error: "invalid_snapshot", status: 500 };
  }
  const reviewRow = payload.review as Record<string, unknown> | null | undefined;
  const review = mapBuyerStoreOrderReviewRow(reviewRow ?? null);
  return {
    ok: true,
    data: {
      order: payload.order,
      items: Array.isArray(payload.items) ? (payload.items as Record<string, unknown>[]) : [],
      store: (payload.store as Record<string, unknown>) ?? {},
      delivery: (payload.delivery as Record<string, unknown>) ?? null,
      review,
      reviewsUnavailable: false,
    },
  };
}

export function buildBuyerStoreOrderDetailResponseBody(
  data: BuyerStoreOrderDetailGateData
): {
  ok: true;
  order: Record<string, unknown>;
  items: Record<string, unknown>[];
  delivery: Record<string, unknown> | null;
  review: BuyerStoreOrderReviewSummary | null;
  review_status: string;
  can_submit_review: boolean;
  order_chat_ready: boolean;
} {
  const { order, store, items } = data;
  const linkedRoomId =
    typeof order.community_messenger_room_id === "string"
      ? order.community_messenger_room_id.trim()
      : "";
  const room_id_exists = linkedRoomId ? 1 : 0;
  const store_pickup_address_lines = formatStorePickupAddressLines({
    region: store.region as string | null | undefined,
    city: store.city as string | null | undefined,
    district: store.district as string | null | undefined,
    address_line1: store.address_line1 as string | null | undefined,
    address_line2: store.address_line2 as string | null | undefined,
  });
  const completed = order.order_status === "completed";
  const canSubmitReview = completed && !data.review && !data.reviewsUnavailable;
  return {
    ok: true,
    order: {
      ...order,
      store_name: (store.store_name as string) ?? "",
      store_slug: (store.slug as string) ?? "",
      owner_user_id: (store.owner_user_id as string) ?? "",
      store_pickup_address_lines,
    },
    items,
    delivery: data.delivery ? sanitizeBuyerDeliveryPublic(data.delivery) : null,
    review: data.review,
    review_status: completed
      ? data.review
        ? "completed"
        : data.reviewsUnavailable
          ? "unavailable"
          : "pending"
      : "not_applicable",
    can_submit_review: canSubmitReview,
    order_chat_ready: room_id_exists === 1,
  };
}

export function gateDataFromLegacyInput(input: {
  order: Record<string, unknown>;
  items: Record<string, unknown>[];
  store: Record<string, unknown> | null | undefined;
  delivery: Record<string, unknown> | null;
  review: BuyerStoreOrderReviewSummary | null;
  reviewsUnavailable: boolean;
}): BuyerStoreOrderDetailGateData {
  return {
    order: input.order,
    items: input.items,
    store: input.store ?? {},
    delivery: input.delivery,
    review: input.review,
    reviewsUnavailable: input.reviewsUnavailable,
  };
}
