/**
 * 오너용 GET …/api/me/stores/:storeId/orders — 폴링·포커스·수동 새로고침 겹침 시 합류.
 * 응답은 `owner-store-orders-list-cache` 에 파싱·정규화 후 보관 (허브 타임라인 캐시와 분리).
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { ENTRY_SHARED_FLIGHT_DEADLINE_MS, runWithSharedFlightDeadline } from "@/lib/http/shared-flight-deadline";
import {
  peekOwnerStoreOrdersListCache,
  seedOwnerStoreOrdersListCacheFromJson,
} from "@/lib/delivery/owner/owner-store-orders-list-cache";

export type StoreOrdersListResult = {
  status: number;
  json: unknown;
};

/** 공유 요청 안에서 헤더·본문 읽기를 한 마감으로 묶는다 — 멈춘 요청이 주문 목록 키를 붙잡지 않게 */
function fetchOwnerOrdersJson(label: string, url: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  return runWithSharedFlightDeadline(label, ENTRY_SHARED_FLIGHT_DEADLINE_MS, async (signal) => {
    const res = await fetch(url, { credentials: "include", cache: "no-store", signal });
    const json: unknown = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  });
}

export function fetchStoreOrdersListDeduped(
  storeId: string,
  opts?: { forceNetwork?: boolean; fresh?: boolean }
): Promise<StoreOrdersListResult> {
  const sid = storeId.trim();
  const fresh = opts?.fresh === true || opts?.forceNetwork === true;
  const peek = opts?.forceNetwork ? null : peekOwnerStoreOrdersListCache(sid);
  if (peek) {
    return Promise.resolve({
      status: 200,
      json: {
        ok: true,
        orders: peek.orders,
        meta: {
          pending_accept_count: peek.meta.pending_accept_count,
          refund_requested_count: peek.meta.refund_requested_count,
          pending_delivery_count: peek.meta.pending_delivery_count,
        },
      },
    });
  }
  const flightKey = fresh ? `me:store:${sid}:orders:fresh` : `me:store:${sid}:orders`;
  const query = fresh ? "?fresh=1" : "";
  return runSingleFlight(flightKey, async (): Promise<StoreOrdersListResult> => {
    const { ok, status, json } = await fetchOwnerOrdersJson(
      "owner_store_orders_list",
      `/api/me/stores/${encodeURIComponent(sid)}/orders${query}`
    );
    if (ok) {
      seedOwnerStoreOrdersListCacheFromJson(sid, json);
      const cached = peekOwnerStoreOrdersListCache(sid);
      if (cached) {
        return {
          status,
          json: {
            ok: true,
            orders: cached.orders,
            meta: cached.meta,
          },
        };
      }
    }
    return { status, json };
  });
}

/** ORD-05 「이전 주문 더 보기」 — 캐시 없이 한 페이지. */
export function fetchOwnerStoreOrdersHistoryPage(
  storeId: string,
  cursor: string
): Promise<StoreOrdersListResult> {
  const sid = storeId.trim();
  const c = cursor.trim();
  return runSingleFlight(`me:store:${sid}:orders:history:${c}`, async (): Promise<StoreOrdersListResult> => {
    const { status, json } = await fetchOwnerOrdersJson(
      "owner_store_orders_history",
      `/api/me/stores/${encodeURIComponent(sid)}/orders?history_cursor=${encodeURIComponent(c)}`
    );
    return { status, json };
  });
}

/**
 * 주문 목록 날짜 필터 한 페이지 (Owner 2026-11-03) — 서버 캐시 없음 · 같은 조건·커서끼리만 묶음.
 * `basis` = 완료 탭 `completed`, 그 밖 `created`.
 */
export function fetchOwnerStoreOrdersDatePage(
  storeId: string,
  filter: { from: string; to: string; basis: "created" | "completed" },
  cursor = ""
): Promise<StoreOrdersListResult> {
  const sid = storeId.trim();
  const qs = new URLSearchParams({ from: filter.from, to: filter.to, basis: filter.basis });
  if (cursor.trim()) qs.set("history_cursor", cursor.trim());
  return runSingleFlight(`me:store:${sid}:orders:date:${qs.toString()}`, async (): Promise<StoreOrdersListResult> => {
    const { status, json } = await fetchOwnerOrdersJson(
      "owner_store_orders_date",
      `/api/me/stores/${encodeURIComponent(sid)}/orders?${qs.toString()}`
    );
    return { status, json };
  });
}
