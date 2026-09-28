import type {
  DeliverySearchMenu,
  DeliverySearchStore,
} from "@/components/delivery/search/DeliverySearchResults";
import { isSearchableGlobalQuery } from "@/lib/search/global/semantics/is-searchable-query";
import {
  matchDeliveryMenuGlobalSearch,
  matchDeliveryStoreGlobalSearch,
} from "@/lib/search/global/semantics/domain-fields";

export type DeliverySearchAdapterResult =
  | { ok: true; stores: DeliverySearchStore[]; menus: DeliverySearchMenu[] }
  | { ok: false };

export async function searchDeliveryForGlobal(
  q: string,
  signal: AbortSignal
): Promise<DeliverySearchAdapterResult> {
  const keyword = q.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!keyword || !isSearchableGlobalQuery(keyword)) return { ok: true, stores: [], menus: [] };
  try {
    const res = await fetch(`/api/stores/search?q=${encodeURIComponent(keyword)}`, {
      cache: "no-store",
      credentials: "include",
      signal,
    });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as {
      ok?: boolean;
      stores?: DeliverySearchStore[];
      menus?: DeliverySearchMenu[];
    };
    if (json.ok === false) return { ok: false };
    return {
      ok: true,
      stores: (Array.isArray(json.stores) ? json.stores : []).filter(
        (store) => matchDeliveryStoreGlobalSearch(store, keyword).matched
      ),
      menus: (Array.isArray(json.menus) ? json.menus : []).filter(
        (menu) => matchDeliveryMenuGlobalSearch(menu, keyword).matched
      ),
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false };
  }
}
