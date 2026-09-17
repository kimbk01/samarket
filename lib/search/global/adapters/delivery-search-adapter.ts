import type {
  DeliverySearchMenu,
  DeliverySearchStore,
} from "@/components/delivery/search/DeliverySearchResults";

export type DeliverySearchAdapterResult =
  | { ok: true; stores: DeliverySearchStore[]; menus: DeliverySearchMenu[] }
  | { ok: false };

export async function searchDeliveryForGlobal(
  q: string,
  signal: AbortSignal
): Promise<DeliverySearchAdapterResult> {
  const keyword = q.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!keyword) return { ok: true, stores: [], menus: [] };
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
      stores: Array.isArray(json.stores) ? json.stores : [],
      menus: Array.isArray(json.menus) ? json.menus : [],
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false };
  }
}
