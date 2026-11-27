/**
 * 2026-11-27 최종 설계 단계 1 — 관리자 설정 키 인스턴스 공유 캐시.
 * - 공유 캐시 성공 → 호출부 클라이언트는 쓰지 않는다 / 실패 → 지금처럼 호출부 클라이언트로 직접
 * - 키 목록 = 각 모듈 상수
 * - 이 키를 쓰는(저장하는) 파일은 모두 저장 뒤 무효화를 부른다 (소스 검사)
 * - 회원 경로 읽기는 공유 캐시를 쓴다
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
/** 테스트에서는 캐시 없이 함수를 그대로 부른다(공유 캐시 동작은 Next 가 책임) */
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

const sharedFrom = vi.fn();
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({ from: sharedFrom }),
}));

import {
  ADMIN_SETTING_SHARED_KEYS,
  ADMIN_SETTING_SHARED_REVALIDATE_SEC,
  adminSettingSharedCacheTag,
  invalidateAdminSettingSharedCache,
  readAdminSettingShared,
} from "@/lib/admin-settings/admin-setting-shared-cache.server";
import { APP_SETTINGS_BUNDLE_KEY } from "@/lib/admin-settings/app-settings-keys";
import { PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY } from "@/lib/community-feed/philife-neighborhood-section";
import { STARTUP_CONFIG_SETTINGS_KEY } from "@/lib/startup/startup-config";
import { LAUNCH_INTRO_POOL_POLICY_KEY } from "@/lib/launch-intro/pool";
import { TRADE_SETTINGS_KEY } from "@/services/trade/trade-settings.service";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function rowQuery(result: { data: unknown; error: unknown }) {
  return { select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) };
}

beforeEach(() => {
  sharedFrom.mockReset();
  revalidateTag.mockReset();
});

describe("공유 캐시 읽기", () => {
  it("성공 → 호출부 클라이언트는 쓰지 않는다", async () => {
    sharedFrom.mockReturnValue(rowQuery({ data: { value_json: { a: 1 }, updated_at: "t1" }, error: null }));
    const callerFrom = vi.fn();
    const r = await readAdminSettingShared("startup_config_v1", { from: callerFrom } as never);
    expect(r).toEqual({ data: { value_json: { a: 1 }, updated_at: "t1" }, error: null });
    expect(callerFrom).not.toHaveBeenCalled();
  });

  it("행 없음 → data null (기본값은 호출부가 정한다)", async () => {
    sharedFrom.mockReturnValue(rowQuery({ data: null, error: null }));
    expect(await readAdminSettingShared("trade_detail_ops", { from: vi.fn() } as never)).toEqual({
      data: null,
      error: null,
    });
  });

  it("DB 오류 → 캐시하지 않고 호출부 클라이언트로 직접 (오류도 그대로 돌려준다)", async () => {
    sharedFrom.mockReturnValue(rowQuery({ data: null, error: { message: "boom" } }));
    const callerFrom = vi.fn(() => rowQuery({ data: null, error: { message: "direct-boom", code: "X" } }));
    const r = await readAdminSettingShared("app_settings_bundle_v1", { from: callerFrom } as never);
    expect(callerFrom).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ data: null, error: { message: "direct-boom", code: "X" } });
  });

  it("무효화 → 그 키 태그를 즉시 만료", () => {
    invalidateAdminSettingSharedCache("launch_intro_pool_policy_v1");
    expect(revalidateTag).toHaveBeenCalledWith("admin-setting:launch_intro_pool_policy_v1", { expire: 0 });
  });

  it("요청 밖에서 무효화가 던져도 저장 흐름을 막지 않는다", () => {
    revalidateTag.mockImplementation(() => {
      throw new Error("outside request");
    });
    expect(() => invalidateAdminSettingSharedCache("trade_detail_ops")).not.toThrow();
  });

  it("안전망 자연 만료 1시간 · 태그 이름", () => {
    expect(ADMIN_SETTING_SHARED_REVALIDATE_SEC).toBe(3600);
    expect(adminSettingSharedCacheTag("x")).toBe("admin-setting:x");
  });
});

describe("키 목록 = 각 모듈 상수", () => {
  it("5개", () => {
    expect([...ADMIN_SETTING_SHARED_KEYS].sort()).toEqual(
      [
        APP_SETTINGS_BUNDLE_KEY,
        PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY,
        STARTUP_CONFIG_SETTINGS_KEY,
        LAUNCH_INTRO_POOL_POLICY_KEY,
        TRADE_SETTINGS_KEY,
      ].sort()
    );
  });
});

/** 키 → 그 키를 가리키는 이름(문자열·상수) */
const KEY_REFERENCES: Record<string, string[]> = {
  app_settings_bundle_v1: ["app_settings_bundle_v1", "APP_SETTINGS_BUNDLE_KEY"],
  philife_neighborhood_section: ["philife_neighborhood_section", "PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY"],
  startup_config_v1: ["startup_config_v1", "STARTUP_CONFIG_SETTINGS_KEY"],
  launch_intro_pool_policy_v1: ["launch_intro_pool_policy_v1", "LAUNCH_INTRO_POOL_POLICY_KEY"],
  trade_detail_ops: ["trade_detail_ops", "TRADE_SETTINGS_KEY"],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(process.cwd(), dir))) {
    if (name === "node_modules" || name === "__tests__") continue;
    const rel = join(dir, name);
    if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

const WRITE_RE = /\.from\(\s*"admin_settings"\s*\)\s*\.(upsert|update|insert|delete)\b/;

describe("저장 지점 = 무효화 지점", () => {
  const files = [...walk("app"), ...walk("lib"), ...walk("services")];

  it("공유 캐시 키를 쓰는 파일은 모두 무효화를 부른다", () => {
    const writers: string[] = [];
    const missing: string[] = [];
    for (const f of files) {
      const src = read(f);
      if (!WRITE_RE.test(src)) continue;
      const hit = Object.entries(KEY_REFERENCES).filter(([, refs]) => refs.some((r) => src.includes(r)));
      if (!hit.length) continue;
      writers.push(f);
      for (const [key] of hit) {
        const refs = KEY_REFERENCES[key];
        const called = refs.some((r) => src.includes(`invalidateAdminSettingSharedCache(${r === key ? `"${key}"` : r})`));
        if (!called) missing.push(`${f} → ${key}`);
      }
    }
    expect(missing).toEqual([]);
    /** 2026-11-27 기준 저장 지점 5곳 — 늘면 위 검사가 같이 돈다 */
    expect(writers.sort()).toEqual(
      [
        "app/api/admin/community/philife-neighborhood-section/route.ts",
        "app/api/admin/trade/settings/route.ts",
        "lib/admin-settings/app-settings-db.ts",
        "lib/launch-intro/pool-server.ts",
        "lib/startup/startup-config-db.ts",
      ].sort()
    );
  });

  it("회원 경로 읽기는 공유 캐시를 쓴다", () => {
    expect(read("app/api/app-settings/route.ts")).toContain("loadAppSettingsBundleShared(sb)");
    expect(read("lib/admin-settings/get-app-settings-server.ts")).toContain("loadAppSettingsBundleShared(sb)");
    expect(read("app/api/app/startup-config/route.ts")).toContain("loadStartupConfigShared(sb)");
    expect(read("lib/launch-intro/pool-server.ts")).toContain("loadLaunchIntroPoolPolicyShared(sb)");
    expect(read("lib/trade/marketplace/sold-visible-window.server.ts")).toContain(
      "readAdminSettingShared(TRADE_SETTINGS_KEY, sb)"
    );
    expect(read("lib/community-feed/philife-neighborhood-section.ts")).toContain(
      "readAdminSettingShared(PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY, client)"
    );
    expect(read("services/trade/trade-detail.service.ts")).toContain(
      "readAdminSettingShared(TRADE_SETTINGS_KEY, sb as SupabaseClient)"
    );
  });

  it("관리자 화면·관리자 저장은 공유 캐시가 아니라 DB 를 직접 읽는다", () => {
    const route = read("app/api/admin/community/philife-neighborhood-section/route.ts");
    expect(route).toContain("getPhilifeNeighborhoodSectionSlugServer(undefined, { fresh: true })");
    expect(route).toContain("getPhilifeShowAllFeedTabServer(undefined, { fresh: true })");
    expect(route).toContain("getPhilifeShowNeighborOnlyFilterServer(undefined, { fresh: true })");
    for (const f of ["app/admin/community/sections/page.tsx", "app/admin/community/topics/page.tsx"]) {
      expect(read(f)).toContain("getPhilifeNeighborhoodSectionSlugServer(undefined, { fresh: true })");
    }
    for (const f of ["app/api/admin/community/notices/route.ts", "lib/admin/community-admin/community-post-admin-patch.ts"]) {
      expect(read(f)).toContain("getPhilifeNeighborhoodSectionSlugServer(sb, { fresh: true })");
    }
  });

  it("관리자 저장 직전 병합은 DB 를 직접 읽는다", () => {
    const src = read("app/api/admin/community/philife-neighborhood-section/route.ts");
    expect(src.match(/getPhilifeNeighborhoodSectionSettingsV1Server\(sb, \{ fresh: true \}\)/g)?.length).toBe(2);
  });
});
