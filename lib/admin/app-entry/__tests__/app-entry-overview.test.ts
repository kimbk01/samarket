/**
 * @vitest-environment node
 * 앱 진입 어드민 v3 §B 「한눈에 보기」 — API 응답 모양 · 앱과 같은 서버 함수 사용 · 설치 버전 묶기.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 가짜 DB·모듈 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  admin: { ok: true } as { ok: boolean; response?: unknown },
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  calls: [] as { table: string; ops: [string, unknown[]][] }[],
  poolPayload: null as unknown,
  poolPolicy: { ok: true, policy: { enabled: true, showOnOsRestore: false }, revision: null } as unknown,
  poolRows: { ok: true, rows: [] } as unknown,
  live: { ok: true, live: { publication_id: "pub-1", state: "paused", revision: 3, updated_at: "2026-11-17T01:00:00.000Z" } } as unknown,
  popupPolicy: { policy: { enabled: true, maxPerEntry: 2, allowLandscape: true }, revision: null } as unknown,
  startup: { ok: true, config: { version: 3, initialSurface: "community", updatedAt: "x" }, source: "db" } as unknown,
}));

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: async () => (H.admin.ok ? { ok: true, userId: "u1" } : { ok: false, response: H.admin.response }),
}));

function makeSb() {
  return {
    from(table: string) {
      const rec = { table, ops: [] as [string, unknown[]][] };
      H.calls.push(rec);
      const chain: any = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              const r = H.tables[table] ?? { data: [], error: null };
              return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(r).then(res, rej);
            }
            if (prop === "maybeSingle") {
              return () => {
                const r = H.tables[table] ?? { data: null, error: null };
                const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
                return Promise.resolve({ data: d, error: r.error });
              };
            }
            return (...args: unknown[]) => {
              rec.ops.push([String(prop), args]);
              return chain;
            };
          },
        }
      );
      return chain;
    },
  };
}

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/os-launch/server", () => ({
  getOsLaunchBuildConfig: () => ({
    version: 1,
    backgroundColor: "#075740",
    logo: { source: "public/x.png", width: 1, height: 1, sha256: "build-sha" },
    appliedFromAdmin: null,
  }),
  loadOsLaunchPending: async () => ({
    ok: true,
    pending: { backgroundColor: "#111111", logo: null, updatedAt: "2026-11-16T00:00:00.000Z", updatedBy: null },
  }),
}));
vi.mock("@/lib/startup/startup-config-db", () => ({ loadStartupConfigFromDb: async () => H.startup }));
vi.mock("@/lib/launch-intro/pool-server", () => ({
  buildLaunchIntroPoolPayload: async () => H.poolPayload,
  loadLaunchIntroPoolPolicy: async () => H.poolPolicy,
  listLaunchIntroPoolRows: async () => H.poolRows,
}));
vi.mock("@/lib/launch-intro/server", () => ({ loadLaunchIntroLive: async () => H.live }));
vi.mock("@/lib/platform-popup/entry-policy-server", () => ({
  loadPlatformPopupEntryPolicyFromStore: async () => {
    if (H.popupPolicy === "fail") throw new Error("read_failed");
    return H.popupPolicy;
  },
}));
vi.mock("@/lib/admin/store-orders/load-admin-store-order-detail", () => ({
  loadAdminUserLabels: async (_sb: unknown, ids: string[]) => new Map(ids.map((id) => [id, "메인관리자"])),
}));

import { GET } from "@/app/api/admin/app-entry/overview/route";
import { bucketInstalledVersions } from "@/lib/admin/app-entry/overview-server";

const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

beforeEach(() => {
  H.admin = { ok: true };
  H.calls = [];
  H.popupPolicy = { policy: { enabled: true, maxPerEntry: 2, allowLandscape: true }, revision: null };
  H.poolPayload = {
    enabled: true,
    showOnOsRestore: false,
    revision: "r",
    entries: [
      { id: "c1", startAtMs: 0, endAtMs: 0 },
      { id: "c2", startAtMs: NOW + 86400000, endAtMs: 0 },
    ],
  };
  H.poolRows = { ok: true, rows: [{ id: "c1", name: "11월 배달 쿠폰" }, { id: "c2", name: "12월" }] };
  H.tables = {
    admin_settings: { data: { updated_at: "2026-11-17T03:20:00.000Z" }, error: null },
    audit_logs: { data: [{ actor_id: "11111111-1111-1111-1111-111111111111", created_at: "x" }], error: null },
    platform_popup_campaigns: {
      data: [
        { status: "active", approval_status: "approved", start_at: null, end_at: null, presentation_type: "center_modal" },
        { status: "scheduled", approval_status: "approved", start_at: iso(NOW - 1000), end_at: iso(NOW + 100000), presentation_type: null },
        // 기간 밖 · PTR 띠 · 미승인 → 빠짐
        { status: "active", approval_status: "approved", start_at: iso(NOW + 100000), end_at: null, presentation_type: null },
        { status: "active", approval_status: "approved", start_at: null, end_at: null, presentation_type: "ptr_reveal" },
        { status: "active", approval_status: "pending", start_at: null, end_at: null, presentation_type: null },
      ],
      error: null,
    },
    user_devices: {
      data: [
        { platform: "android", device_id: "a1", app_version: "1.2.7 (66)" },
        { platform: "android", device_id: "a1", app_version: "1.2.6 (60)" },
        { platform: "android", device_id: "a2", app_version: "1.2.7 (66)" },
        { platform: "ios", device_id: "i1", app_version: "1.2.4 (53)" },
        { platform: "ios", device_id: "i2", app_version: null },
      ],
      error: null,
    },
  };
});

describe("GET /api/admin/app-entry/overview", () => {
  it("관리자 가드 실패면 가드 응답 그대로", async () => {
    const denied = new Response("no", { status: 403 });
    H.admin = { ok: false, response: denied };
    expect(await GET()).toBe(denied);
  });

  it("4단계 + 설치 버전 모양 — 서버 함수 값을 그대로 싣는다", async () => {
    const res = await GET();
    const json = (await res.json()) as any;
    expect(json.ok).toBe(true);
    expect(Object.keys(json).sort()).toEqual(["firstEntry", "generatedAt", "installs", "intro", "ok", "os", "popup"]);

    expect(json.os).toEqual({
      ok: true,
      build: { backgroundColor: "#075740", logoSha256: "build-sha" },
      pending: { backgroundColor: "#111111", logoSha256: null, updatedAt: "2026-11-16T00:00:00.000Z" },
      pendingChanged: true,
      applyModel: "next_native_build",
    });

    expect(json.firstEntry).toMatchObject({
      ok: true,
      initialSurface: "community",
      path: "/philife",
      source: "db",
      lastChange: {
        at: "2026-11-17T03:20:00.000Z",
        actorId: "11111111-1111-1111-1111-111111111111",
        actorLabel: "메인관리자",
      },
    });

    expect(json.intro.pool).toEqual({
      ok: true,
      policyEnabled: true,
      enabled: true,
      showOnOsRestore: false,
      deviceEntryCount: 2,
      showingNowCount: 1,
      first: { id: "c1", name: "11월 배달 쿠폰", startsLater: false },
    });
    expect(json.intro.scenes).toEqual({ ok: true, state: "paused", publicationId: "pub-1", updatedAt: "2026-11-17T01:00:00.000Z" });

    expect(json.popup).toEqual({
      policy: { ok: true, enabled: true, maxPerEntry: 2, allowLandscape: true },
      eligible: { ok: true, count: 2 },
    });

    expect(json.installs).toEqual({
      ok: true,
      windowDays: 30,
      android: [{ version: "1.2.7 (66)", devices: 2 }],
      ios: [
        { version: "unknown", devices: 1 },
        { version: "1.2.4 (53)", devices: 1 },
      ],
      truncated: false,
      rowLimit: 20000,
    });

    // 설치 버전 = 활성 · Android/iOS · 최근 30일 (읽기 전용 select)
    const devices = H.calls.find((c) => c.table === "user_devices")!;
    expect(devices.ops.map((o) => o[0])).toEqual(["select", "eq", "in", "gte", "order", "limit"]);
    expect(devices.ops[1][1]).toEqual(["is_active", true]);
    // 빌드 전 감사 A3: 마지막 변경 조회는 색인 앞 열 target_type 을 건다
    const audit = H.calls.find((c) => c.table === "audit_logs")!;
    expect(audit.ops.filter((o) => o[0] === "eq").map((o) => o[1])).toEqual([
      ["target_type", "admin_settings"],
      ["action", "startup_config.update"],
      ["target_id", "startup_config_v1"],
    ]);
    for (const c of H.calls) {
      expect(c.ops.some((o) => ["insert", "update", "upsert", "delete"].includes(o[0])), c.table).toBe(false);
    }
  });

  it("한 칸이 실패해도 다른 칸은 그대로 (칸별 오류 코드)", async () => {
    H.poolPayload = null;
    H.tables.user_devices = { data: null, error: { message: "boom" } };
    H.popupPolicy = "fail";
    const json = (await (await GET()).json()) as any;
    expect(json.intro.pool).toEqual({ ok: false, error: "intro_pool_read_failed" });
    expect(json.installs).toEqual({ ok: false, error: "user_devices_read_failed" });
    expect(json.popup.policy).toEqual({ ok: false, error: "popup_policy_read_failed" });
    expect(json.popup.eligible).toEqual({ ok: true, count: 2 });
    expect(json.os.ok).toBe(true);
  });
});

describe("bucketInstalledVersions", () => {
  it("기기 1대 1번 · 웹 제외 · 많은 순", () => {
    expect(
      bucketInstalledVersions([
        { platform: "web", device_id: "w", app_version: "x" },
        { platform: "android", device_id: "a", app_version: "2" },
        { platform: "android", device_id: "b", app_version: "1" },
        { platform: "android", device_id: "c", app_version: "1" },
      ])
    ).toEqual({ android: [{ version: "1", devices: 2 }, { version: "2", devices: 1 }], ios: [] });
  });
});
