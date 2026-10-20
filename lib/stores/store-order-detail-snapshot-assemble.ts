/**
 * SOD1 store order detail — CPU-only assemble + shared buyer GET body builder.
 */
import { stripStoreInternalOrderFields } from "@/lib/stores/buyer-store-order-money";
import { stripDeliveryProofStorageFromClientRow } from "@/lib/stores/delivery-proof-admin-view";
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

/**
 * ORD-07 ⊃ DLV-04 — 오너·구매자 공용: 배달 행에서 관리자 메모·증빙 저장 경로/URL·증빙/실패 좌표 제거.
 * DB 스냅샷 RPC 가 명시 컬럼만 반환하지만(20270602140200), 캐시된 구 페이로드·폴백 경로 방어 이중화.
 */
export const STORE_ORDER_DELIVERY_CLIENT_HIDDEN_FIELDS = [
  "admin_note",
  "delivered_proof_lat",
  "delivered_proof_lng",
  "failure_report_lat",
  "failure_report_lng",
] as const;

export function stripStoreOrderDeliveryForClient(
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!raw) return null;
  const rest = stripDeliveryProofStorageFromClientRow(raw);
  for (const k of STORE_ORDER_DELIVERY_CLIENT_HIDDEN_FIELDS) delete rest[k];
  return rest;
}

/** 구매자 배달 행에서 추가로 빼는 라이더 내부 사유·메모 (구매자 화면 미사용). */
const BUYER_DELIVERY_EXTRA_HIDDEN_FIELDS = [
  "rider_decline_reason",
  "rider_failure_report_reason",
  "rider_failure_reported_at",
  "failure_note",
  "delivered_proof_note",
] as const;

/** 구매자 노출: 공용 정제 + 라이더 내부 필드 제외 + 수령자 이름 마스킹 */
export function sanitizeBuyerDeliveryPublic(
  input: Record<string, unknown> | null
): Record<string, unknown> | null {
  const raw = stripStoreOrderDeliveryForClient(input);
  if (!raw) return null;
  for (const k of BUYER_DELIVERY_EXTRA_HIDDEN_FIELDS) delete raw[k];
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
  const storeProfileImageUrl =
    typeof store.profile_image_url === "string" && store.profile_image_url.trim()
      ? store.profile_image_url.trim()
      : null;
  return {
    ok: true,
    order: {
      ...stripStoreInternalOrderFields(order),
      store_name: (store.store_name as string) ?? "",
      store_slug: (store.slug as string) ?? "",
      owner_user_id: (store.owner_user_id as string) ?? "",
      store_profile_image_url: storeProfileImageUrl,
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
