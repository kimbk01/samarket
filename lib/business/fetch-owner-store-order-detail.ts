import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  normalizeOwnerStoreOrderReviewDetail,
  type OwnerStoreOrderReviewDetail,
} from "@/lib/stores/owner-store-order-review-meta";

export type OwnerStoreOrderDetailFetchResult = {
  ok: boolean;
  status: number;
  error: string | null;
  order: Record<string, unknown> | null;
  delivery: unknown;
  review: OwnerStoreOrderReviewDetail | null;
};

export function ownerStoreOrderDetailFlightKey(storeId: string, orderId: string): string {
  return `owner:store-order-detail:${storeId.trim()}:${orderId.trim()}`;
}

// CONTRACT: single-flight 는 파싱된 JSON 만 반환 — Response 객체 공유 금지(json 1회 소비).
export function fetchOwnerStoreOrderDetailDeduped(
  storeId: string,
  orderId: string
): Promise<OwnerStoreOrderDetailFetchResult> {
  const sid = storeId.trim();
  const oid = orderId.trim();
  if (!sid || !oid) {
    return Promise.resolve({
      ok: false,
      status: 0,
      error: "missing_ids",
      order: null,
      delivery: null,
      review: null,
    });
  }

  return runSingleFlight(ownerStoreOrderDetailFlightKey(sid, oid), async () => {
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(sid)}/orders/${encodeURIComponent(oid)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        order?: Record<string, unknown>;
        delivery?: unknown;
        review?: unknown;
      };

      const ok = res.ok && json.ok === true;
      return {
        ok,
        status: res.status,
        error: ok ? null : typeof json.error === "string" ? json.error : "load_failed",
        order: json.order ?? null,
        delivery: json.delivery ?? null,
        review: ok ? normalizeOwnerStoreOrderReviewDetail(json.review) : null,
      };
    } catch {
      return {
        ok: false,
        status: 0,
        error: "network_error",
        order: null,
        delivery: null,
        review: null,
      };
    }
  });
}
