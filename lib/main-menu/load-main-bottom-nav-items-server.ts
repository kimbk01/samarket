import { unstable_cache } from "next/cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { MAIN_BOTTOM_NAV_SETTINGS_KEY } from "@/lib/main-menu/main-bottom-nav-key";
import { resolveMainBottomNavDisplayItems } from "@/lib/main-menu/resolve-main-bottom-nav";
import { resolveMainBottomNavDisplayItemsWithTradeOverlay } from "@/lib/main-menu/overlay-bottom-nav-labels-from-trade-categories";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

export const MAIN_BOTTOM_NAV_SERVER_CACHE_TAG = "main-bottom-nav";

type MainBottomNavServerSource = "db" | "default";

export type MainBottomNavServerPayload = {
  source: MainBottomNavServerSource;
  items: BottomNavItemConfig[];
};

function cloneBottomNavItems(items: BottomNavItemConfig[]): BottomNavItemConfig[] {
  return items.map((item) => ({ ...item }));
}

async function loadMainBottomNavItemsFromStore(): Promise<MainBottomNavServerPayload> {
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return {
      source: "default",
      items: resolveMainBottomNavDisplayItems(null),
    };
  }

  try {
    const { data, error } = await sb
      .from("admin_settings")
      .select("value_json")
      .eq("key", MAIN_BOTTOM_NAV_SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      if (
        error.message?.includes("admin_settings") &&
        error.message.includes("does not exist")
      ) {
        return {
          source: "default",
          items: await resolveMainBottomNavDisplayItemsWithTradeOverlay(sb, null),
        };
      }
      console.warn("[main-bottom-nav] overlay fallback:", error.message);
      return {
        source: "default",
        items: await resolveMainBottomNavDisplayItemsWithTradeOverlay(sb, null),
      };
    }

    const valueJson = data?.value_json ?? null;
    return {
      source: valueJson ? "db" : "default",
      items: await resolveMainBottomNavDisplayItemsWithTradeOverlay(sb, valueJson),
    };
  } catch {
    return {
      source: "default",
      items: resolveMainBottomNavDisplayItems(null),
    };
  }
}

const loadMainBottomNavItemsCachedInternal = unstable_cache(
  async (): Promise<MainBottomNavServerPayload> => loadMainBottomNavItemsFromStore(),
  ["main-bottom-nav:server:v1"],
  {
    revalidate: 300,
    tags: [MAIN_BOTTOM_NAV_SERVER_CACHE_TAG],
  }
);

export async function loadMainBottomNavItemsServerCached(): Promise<MainBottomNavServerPayload> {
  const payload = await loadMainBottomNavItemsCachedInternal();
  return {
    source: payload.source,
    items: cloneBottomNavItems(payload.items),
  };
}
