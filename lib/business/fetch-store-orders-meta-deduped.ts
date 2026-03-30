import { runSingleFlight } from "@/lib/http/run-single-flight";

export type StoreOrdersMetaResult = { status: number; json: unknown };

/** GET …/orders?meta_only=1 — 카운트만 (대시보드·폴링 경량화) */
export function fetchStoreOrdersMetaDeduped(storeId: string): Promise<StoreOrdersMetaResult> {
  const sid = storeId.trim();
  return runSingleFlight(`me:store:${sid}:orders-meta`, async (): Promise<StoreOrdersMetaResult> => {
    const res = await fetch(
      `/api/me/stores/${encodeURIComponent(sid)}/orders?meta_only=1`,
      { credentials: "include", cache: "no-store" }
    );
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
