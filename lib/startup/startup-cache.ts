/**
 * Startup local cache — Theme / Language / User / Nav / Route / Config.
 * Reads never throw; missing keys fall back to bundled defaults.
 */

import { STARTUP_CACHE_KEYS } from "@/lib/startup/startup-constants";
import {
  BUNDLED_STARTUP_CONFIG,
  STARTUP_CONFIG_LOCAL_STORAGE_KEY,
  normalizeStartupConfig,
  type StartupConfig,
} from "@/lib/startup/startup-config";

export type StartupThemeCache = "light" | "dark" | "system";

export type StartupUserCache = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

export type StartupNavTabCache = {
  id: string;
  href: string;
  label: string;
  labelKo?: string;
  labelEn?: string;
};

export type StartupRouteCache = {
  path: string;
  tabId: string;
};

export const BUNDLED_STARTUP_NAV: readonly StartupNavTabCache[] = [
  { id: "community", href: "/philife", label: "Community", labelKo: "커뮤니티", labelEn: "Community" },
  { id: "home", href: "/market", label: "Trade", labelKo: "거래", labelEn: "Trade" },
  { id: "stores", href: "/stores", label: "Food", labelKo: "배달", labelEn: "Food" },
  {
    id: "chat",
    href: "/community-messenger?section=chats",
    label: "Chat",
    labelKo: "채팅",
    labelEn: "Chat",
  },
  { id: "my", href: "/mypage", label: "My", labelKo: "마이", labelEn: "My" },
] as const;

export const BUNDLED_STARTUP_ROUTE: StartupRouteCache = {
  path: "/",
  tabId: "community",
};

function safeParseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function storageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota */
  }
}

export function readStartupConfigCache(): StartupConfig {
  const raw = storageGet(STARTUP_CONFIG_LOCAL_STORAGE_KEY) ?? storageGet(STARTUP_CACHE_KEYS.config);
  if (!raw) return { ...BUNDLED_STARTUP_CONFIG };
  return normalizeStartupConfig(safeParseJson(raw));
}

export function writeStartupConfigCache(config: StartupConfig): void {
  const next = normalizeStartupConfig(config);
  storageSet(STARTUP_CONFIG_LOCAL_STORAGE_KEY, JSON.stringify(next));
  storageSet(STARTUP_CACHE_KEYS.config, JSON.stringify(next));
}

export function readStartupThemeCache(): StartupThemeCache {
  const raw = storageGet(STARTUP_CACHE_KEYS.theme);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function writeStartupThemeCache(theme: StartupThemeCache): void {
  storageSet(STARTUP_CACHE_KEYS.theme, theme);
}

export function readStartupLangCache(): string {
  const raw = storageGet(STARTUP_CACHE_KEYS.lang);
  if (raw === "ko" || raw === "en") return raw;
  return "ko";
}

export function writeStartupLangCache(lang: string): void {
  const next = lang === "en" ? "en" : "ko";
  storageSet(STARTUP_CACHE_KEYS.lang, next);
}

export function readStartupUserCache(): StartupUserCache | null {
  const parsed = safeParseJson(storageGet(STARTUP_CACHE_KEYS.user));
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  return {
    id,
    displayName: typeof o.displayName === "string" ? o.displayName.trim() : "",
    avatarUrl: typeof o.avatarUrl === "string" ? o.avatarUrl.trim() : "",
  };
}

export function writeStartupUserCache(user: StartupUserCache | null): void {
  if (!user || !user.id) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(STARTUP_CACHE_KEYS.user);
    } catch {
      /* ignore */
    }
    return;
  }
  storageSet(
    STARTUP_CACHE_KEYS.user,
    JSON.stringify({
      id: user.id,
      displayName: user.displayName.slice(0, 64),
      avatarUrl: user.avatarUrl.slice(0, 512),
    })
  );
}

export function readStartupNavCache(): StartupNavTabCache[] {
  const parsed = safeParseJson(storageGet(STARTUP_CACHE_KEYS.nav));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return BUNDLED_STARTUP_NAV.map((t) => ({ ...t }));
  }
  const out: StartupNavTabCache[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const href = typeof o.href === "string" ? o.href.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!id || !href || !label) continue;
    out.push({
      id,
      href,
      label,
      labelKo: typeof o.labelKo === "string" ? o.labelKo : undefined,
      labelEn: typeof o.labelEn === "string" ? o.labelEn : undefined,
    });
  }
  return out.length > 0 ? out : BUNDLED_STARTUP_NAV.map((t) => ({ ...t }));
}

export function writeStartupNavCache(tabs: readonly StartupNavTabCache[]): void {
  const cleaned = tabs
    .filter((t) => t.id && t.href && t.label)
    .map((t) => ({
      id: t.id,
      href: t.href,
      label: t.label,
      labelKo: t.labelKo,
      labelEn: t.labelEn,
    }));
  storageSet(STARTUP_CACHE_KEYS.nav, JSON.stringify(cleaned.length ? cleaned : BUNDLED_STARTUP_NAV));
}

export function readStartupRouteCache(): StartupRouteCache {
  const parsed = safeParseJson(storageGet(STARTUP_CACHE_KEYS.route));
  if (!parsed || typeof parsed !== "object") return { ...BUNDLED_STARTUP_ROUTE };
  const o = parsed as Record<string, unknown>;
  const path = typeof o.path === "string" && o.path.trim() ? o.path.trim() : BUNDLED_STARTUP_ROUTE.path;
  const tabId =
    typeof o.tabId === "string" && o.tabId.trim() ? o.tabId.trim() : BUNDLED_STARTUP_ROUTE.tabId;
  return { path, tabId };
}

export function writeStartupRouteCache(route: StartupRouteCache): void {
  const path = route.path.trim() || "/";
  const tabId = route.tabId.trim() || "community";
  storageSet(STARTUP_CACHE_KEYS.route, JSON.stringify({ path, tabId }));
}

/**
 * Persist shell snapshot after App Ready — idle only, never blocks paint.
 * Messenger/Badge/Delivery/Feed data authority is NOT cached here.
 */
export function scheduleStartupShellCachePersist(input: {
  theme?: StartupThemeCache;
  lang?: string;
  user?: StartupUserCache | null;
  nav?: readonly StartupNavTabCache[];
  route?: StartupRouteCache;
}): void {
  if (typeof window === "undefined") return;
  const run = () => {
    if (input.theme) writeStartupThemeCache(input.theme);
    if (input.lang) writeStartupLangCache(input.lang);
    if (input.user !== undefined) writeStartupUserCache(input.user);
    if (input.nav) writeStartupNavCache(input.nav);
    if (input.route) writeStartupRouteCache(input.route);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => run(), { timeout: 2500 });
  } else {
    window.setTimeout(run, 0);
  }
}
