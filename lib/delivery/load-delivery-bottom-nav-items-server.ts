import { unstable_cache } from "next/cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG = "delivery-bottom-nav";

export type DeliveryBottomNavItem = {
  id: string;
  label: string;
  icon_key: string;
  href: string;
  sort_order: number;
  is_active: boolean;
  is_center: boolean;
  requires_store_id: boolean;
  color: string;
};

type DeliveryBottomNavServerSource = "db" | "default";

export type DeliveryBottomNavServerPayload = {
  source: DeliveryBottomNavServerSource;
  items: DeliveryBottomNavItem[];
};

function defaultDeliveryBottomNavItems(): DeliveryBottomNavItem[] {
  return [
    {
      id: "default_orders",
      label: "내주문",
      icon_key: "orders",
      href: "/my/store-orders",
      sort_order: 0,
      is_active: true,
      is_center: false,
      requires_store_id: false,
      color: "#1C8DB8",
    },
    {
      id: "default_cart",
      label: "장바구니",
      icon_key: "cart",
      href: "/stores/cart",
      sort_order: 1,
      is_active: true,
      is_center: false,
      requires_store_id: false,
      color: "#1C8DB8",
    },
    {
      id: "default_home",
      label: "홈",
      icon_key: "home",
      href: "/philife",
      sort_order: 2,
      is_active: true,
      is_center: true,
      requires_store_id: false,
      color: "#1C8DB8",
    },
    {
      id: "default_store",
      label: "내매장",
      icon_key: "store",
      href: "/my/business",
      sort_order: 3,
      is_active: true,
      is_center: false,
      requires_store_id: true,
      color: "#1C8DB8",
    },
    {
      id: "default_user",
      label: "내정보",
      icon_key: "user",
      href: "/mypage",
      sort_order: 4,
      is_active: true,
      is_center: false,
      requires_store_id: false,
      color: "#1C8DB8",
    },
  ];
}

function cloneItems(items: DeliveryBottomNavItem[]): DeliveryBottomNavItem[] {
  return items.map((i) => ({ ...i }));
}

async function loadDeliveryBottomNavItemsFromStore(): Promise<DeliveryBottomNavServerPayload> {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return { source: "default", items: defaultDeliveryBottomNavItems() };
  }

  try {
    const { data, error } = await sb
      .from("delivery_bottom_nav_items")
      .select("id,label,icon_key,href,sort_order,is_active,is_center,requires_store_id,color")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      if (error.message?.includes("delivery_bottom_nav_items") && error.message.includes("does not exist")) {
        return { source: "default", items: defaultDeliveryBottomNavItems() };
      }
      console.warn("[delivery-bottom-nav] fallback:", error.message);
      return { source: "default", items: defaultDeliveryBottomNavItems() };
    }

    const items = (data ?? []) as DeliveryBottomNavItem[];
    if (!items.length) return { source: "default", items: defaultDeliveryBottomNavItems() };
    return { source: "db", items };
  } catch {
    return { source: "default", items: defaultDeliveryBottomNavItems() };
  }
}

const loadDeliveryBottomNavItemsCachedInternal = unstable_cache(
  async (): Promise<DeliveryBottomNavServerPayload> => loadDeliveryBottomNavItemsFromStore(),
  ["delivery-bottom-nav:server:v1"],
  { revalidate: 300, tags: [DELIVERY_BOTTOM_NAV_SERVER_CACHE_TAG] }
);

export async function loadDeliveryBottomNavItemsServerCached(): Promise<DeliveryBottomNavServerPayload> {
  const payload = await loadDeliveryBottomNavItemsCachedInternal();
  return { source: payload.source, items: cloneItems(payload.items) };
}

