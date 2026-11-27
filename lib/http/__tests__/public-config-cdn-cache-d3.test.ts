import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PUBLIC_CONFIG_CDN_CACHE_CONTROL,
  PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL,
} from "@/lib/http/public-config-cache-control";

/**
 * D3 (2026-11-19) — 모든 회원에게 같은 공개 설정: DB 에서 읽은 응답만 CDN 캐시, 기본값(읽기 실패) 응답은 캐시 금지.
 * 응답 본문은 이전과 같다.
 */
const startup = { sb: true as boolean, loaded: { ok: true, source: "db", config: { version: 2 } } as unknown };
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => (startup.sb ? {} : null) }));
vi.mock("@/lib/startup/startup-config-db", () => ({ loadStartupConfigShared: async () => startup.loaded }));

const appSettings = { loaded: { ok: true, bundle: { settings: { siteName: "X" } } } as unknown, throws: false };
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => {
    if (appSettings.throws) throw new Error("no env");
    return {};
  },
}));
vi.mock("@/lib/admin-settings/app-settings-db", () => ({
  loadAppSettingsBundleShared: async () => appSettings.loaded,
  createDefaultAppSettingsBundle: () => ({ settings: { siteName: "DEFAULT" } }),
}));

const support = { sb: true as boolean, res: { ok: true, rows: [] as unknown[] } as unknown };
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => (support.sb ? {} : null) }));
vi.mock("@/lib/support/support-category-settings-service", () => ({
  listSupportCategorySettings: async () => support.res,
}));

describe("D3 public config CDN cache headers", () => {
  beforeEach(() => {
    vi.resetModules();
    startup.sb = true;
    startup.loaded = { ok: true, source: "db", config: { version: 2 } };
    appSettings.loaded = { ok: true, bundle: { settings: { siteName: "X" } } };
    appSettings.throws = false;
    support.sb = true;
    support.res = { ok: true, rows: [] };
  });

  it("상수: CDN 60초 + swr 5분, 실패는 no-store", () => {
    expect(PUBLIC_CONFIG_CDN_CACHE_CONTROL).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    expect(PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL).toContain("no-store");
  });

  it("startup-config: DB 성공 → CDN, 실패·DB 없음 → no-store", async () => {
    const { GET } = await import("@/app/api/app/startup-config/route");
    expect((await GET()).headers.get("cache-control")).toBe(PUBLIC_CONFIG_CDN_CACHE_CONTROL);
    startup.loaded = { ok: false };
    expect((await GET()).headers.get("cache-control")).toBe(PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL);
    startup.sb = false;
    expect((await GET()).headers.get("cache-control")).toBe(PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL);
  });

  it("app-settings: DB 성공 → CDN(본문 병합 그대로), 실패·예외 → 기본값 + no-store", async () => {
    const { GET } = await import("@/app/api/app-settings/route");
    const ok = await GET();
    expect(ok.headers.get("cache-control")).toBe(PUBLIC_CONFIG_CDN_CACHE_CONTROL);
    expect(((await ok.json()) as { settings: { siteName: string } }).settings.siteName).toBe("X");
    appSettings.loaded = { ok: false };
    const fb = await GET();
    expect(fb.headers.get("cache-control")).toBe(PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL);
    expect(((await fb.json()) as { settings: { siteName: string } }).settings.siteName).toBe("DEFAULT");
    appSettings.throws = true;
    expect((await GET()).headers.get("cache-control")).toBe(PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL);
  });

  it("support/category-settings: 성공 → CDN, 실패·DB 없음 → no-store", async () => {
    const { GET } = await import("@/app/api/support/category-settings/route");
    expect((await GET()).headers.get("cache-control")).toBe(PUBLIC_CONFIG_CDN_CACHE_CONTROL);
    support.res = { ok: false };
    expect((await GET()).headers.get("cache-control")).toBe(PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL);
    support.sb = false;
    expect((await GET()).headers.get("cache-control")).toBe(PUBLIC_CONFIG_FALLBACK_CACHE_CONTROL);
  });
});
