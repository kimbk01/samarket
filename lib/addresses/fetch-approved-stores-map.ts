import type { StoreRow } from "@/lib/stores/db-store-mapper";

/** `/api/me/stores` 승인 매장 id → 표시명 — 주소 관리·장바구니 `shop` 주소 공통 */
export async function fetchApprovedStoresByIdMap(): Promise<ReadonlyMap<string, string>> {
  try {
    const res = await fetch("/api/me/stores", { credentials: "include" });
    const j = (await res.json()) as { ok?: boolean; stores?: StoreRow[] };
    if (!res.ok || !j.ok || !Array.isArray(j.stores)) return new Map();
    const m = new Map<string, string>();
    for (const store of j.stores) {
      if (store.approval_status !== "approved") continue;
      const id = store.id.trim();
      const name = (store.store_name ?? "").trim();
      if (id) m.set(id, name || id);
    }
    return m;
  } catch {
    return new Map();
  }
}
