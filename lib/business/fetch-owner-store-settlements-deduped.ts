import { runSingleFlight } from "@/lib/http/run-single-flight";

export type OwnerStoreSettlementsFetchResult = {
  status: number;
  json: unknown;
};

/** `GET /api/me/store-settlements` — storeId 있으면 해당 매장만 */
export function fetchOwnerStoreSettlementsDeduped(
  storeId?: string | null
): Promise<OwnerStoreSettlementsFetchResult> {
  const sid = (storeId ?? "").trim();
  const qs = sid ? `?storeId=${encodeURIComponent(sid)}` : "";
  const key = sid ? `me:store-settlements:${sid}` : "me:store-settlements:all";
  return runSingleFlight(key, async () => {
    const res = await fetch(`/api/me/store-settlements${qs}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => ({}));
    return { status: res.status, json };
  });
}
