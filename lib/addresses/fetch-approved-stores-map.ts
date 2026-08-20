import {
  fetchMeStoresListDeduped,
  parseStoreRowsFromMeStoresJson,
} from "@/lib/me/fetch-me-stores-deduped";

/**
 * 승인 매장 id → 표시명 — 주소 관리·장바구니 `shop` 주소 공통.
 * Network authority = `fetchMeStoresListDeduped` only (raw GET 금지).
 */
export async function fetchApprovedStoresByIdMap(): Promise<ReadonlyMap<string, string>> {
  try {
    const { status, json } = await fetchMeStoresListDeduped();
    if (status !== 200) return new Map();
    const stores = parseStoreRowsFromMeStoresJson(json);
    if (!stores) return new Map();
    const m = new Map<string, string>();
    for (const store of stores) {
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
