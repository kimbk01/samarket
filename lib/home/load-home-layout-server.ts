import { unstable_cache } from "next/cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  cloneHomeLayout,
  DEFAULT_HOME_LAYOUT,
  HOME_LAYOUT_SERVER_CACHE_TAG,
  HOME_LAYOUT_SETTINGS_KEY,
  normalizeHomeLayout,
  type HomeLayoutConfig,
} from "@/lib/home/home-layout-contract";

export type HomeLayoutServerPayload = {
  source: "db" | "default";
  config: HomeLayoutConfig;
  /** 낙관적 동시성용 판 번호 — `admin_settings.updated_at` (없으면 null) */
  revision: string | null;
};

/** 캐시 없이 읽기 — 어드민 GET·저장 직전 비교용 */
export async function loadHomeLayoutFromStore(): Promise<HomeLayoutServerPayload> {
  const sb = tryGetSupabaseForStores();
  if (!sb) return { source: "default", config: cloneHomeLayout(DEFAULT_HOME_LAYOUT), revision: null };
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json, updated_at")
    .eq("key", HOME_LAYOUT_SETTINGS_KEY)
    .maybeSingle();
  if (error) {
    console.warn("[home-layout] load fallback:", error.message);
    return { source: "default", config: cloneHomeLayout(DEFAULT_HOME_LAYOUT), revision: null };
  }
  const valueJson = (data as { value_json?: unknown } | null)?.value_json ?? null;
  const updatedAt = (data as { updated_at?: string | null } | null)?.updated_at ?? null;
  return {
    source: valueJson ? "db" : "default",
    config: normalizeHomeLayout(valueJson),
    revision: valueJson ? updatedAt : null,
  };
}

const loadHomeLayoutCachedInternal = unstable_cache(
  async (): Promise<HomeLayoutServerPayload> => loadHomeLayoutFromStore(),
  ["home-layout:server:v1"],
  { revalidate: 300, tags: [HOME_LAYOUT_SERVER_CACHE_TAG] }
);

/** 앱 홈 — 서버 캐시(어드민 저장 시 태그 무효화) */
export async function loadHomeLayoutServerCached(): Promise<HomeLayoutServerPayload> {
  try {
    const p = await loadHomeLayoutCachedInternal();
    return { source: p.source, config: cloneHomeLayout(p.config), revision: p.revision };
  } catch {
    return { source: "default", config: cloneHomeLayout(DEFAULT_HOME_LAYOUT), revision: null };
  }
}
