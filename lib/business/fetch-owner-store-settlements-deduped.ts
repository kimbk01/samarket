import { runSingleFlight } from "@/lib/http/run-single-flight";

export type OwnerStoreSettlementsFetchResult = {
  status: number;
  json: unknown;
};

export type OwnerStoreSettlementsQuery = {
  storeId?: string | null;
  from?: string | null;
  to?: string | null;
  orderNo?: string | null;
  settlementStatus?: string | null;
};

/** `GET /api/me/store-settlements` — storeId 있으면 해당 매장만 */
export function fetchOwnerStoreSettlementsDeduped(
  storeIdOrQuery?: string | null | OwnerStoreSettlementsQuery
): Promise<OwnerStoreSettlementsFetchResult> {
  const q: OwnerStoreSettlementsQuery =
    typeof storeIdOrQuery === "string" || storeIdOrQuery == null
      ? { storeId: storeIdOrQuery }
      : storeIdOrQuery;

  const params = new URLSearchParams();
  const sid = (q.storeId ?? "").trim();
  if (sid) params.set("storeId", sid);
  if (q.from?.trim()) params.set("from", q.from.trim());
  if (q.to?.trim()) params.set("to", q.to.trim());
  if (q.orderNo?.trim()) params.set("order_no", q.orderNo.trim());
  if (q.settlementStatus?.trim()) params.set("settlement_status", q.settlementStatus.trim());

  const qs = params.toString() ? `?${params.toString()}` : "";
  const key = `me:store-settlements:${params.toString() || "all"}`;
  return runSingleFlight(key, async () => {
    const res = await fetch(`/api/me/store-settlements${qs}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
