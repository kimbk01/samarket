import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SUPABASE_ROUTE_CATEGORY,
  SUPABASE_ROUTE_TEST_CATEGORY,
  SUPABASE_TARGET_CATEGORY,
  SupabaseCallCounter,
  installSupabaseCallCounter,
  routeToRollupMetric,
  sendSupabaseCallRollup,
  supabaseTargetMetric,
} from "@/lib/perf/supabase-call-counter";
import { shouldInstallSupabaseCallCounter } from "@/lib/perf/install-supabase-call-counter.server";

const ORIGIN = "https://proj.supabase.co";
const METRIC_RE = /^[a-z0-9_.:-]{1,96}$/;

describe("routeToRollupMetric — 집계 표 metric 규칙(cm_monitoring_rollup_add)", () => {
  it("동적 세그먼트·슬래시 변환", () => {
    expect(routeToRollupMetric("/api/community-messenger/rooms/[roomId]/messages")).toBe(
      "api.community-messenger.rooms.:roomid.messages",
    );
    expect(routeToRollupMetric("/api/x/[...slug]")).toBe("api.x.:slug");
    expect(routeToRollupMetric(null)).toBe("unknown");
  });
  it("예산 표의 모든 라우트가 DB 규칙을 통과하고 서로 겹치지 않는다", async () => {
    const { ROUTE_SUPABASE_CALL_BUDGET } = await import("@/lib/perf/request-budget");
    const seen = new Set<string>();
    for (const route of Object.keys(ROUTE_SUPABASE_CALL_BUDGET)) {
      const m = routeToRollupMetric(route);
      expect(m).toMatch(METRIC_RE);
      expect(seen.has(m)).toBe(false);
      seen.add(m);
    }
  });
});

describe("supabaseTargetMetric", () => {
  it("rest·rpc·auth·storage·realtime", () => {
    expect(supabaseTargetMetric(`${ORIGIN}/rest/v1/profiles?select=id`, ORIGIN)).toBe("rest.profiles");
    expect(supabaseTargetMetric(`${ORIGIN}/rest/v1/rpc/member_write_gate_snapshot`, ORIGIN)).toBe(
      "rpc.member_write_gate_snapshot",
    );
    expect(supabaseTargetMetric(`${ORIGIN}/auth/v1/.well-known/jwks.json`, ORIGIN)).toBe("auth..well-known.jwks.json");
    expect(supabaseTargetMetric(`${ORIGIN}/storage/v1/object/x`, ORIGIN)).toBe("storage");
    expect(supabaseTargetMetric(`${ORIGIN}/realtime/v1/api/broadcast`, ORIGIN)).toBe("realtime");
  });
});

describe("SupabaseCallCounter", () => {
  it("요청 단위로 호출·요청 수·최대치를 센다", () => {
    const c = new SupabaseCallCounter(ORIGIN);
    const reqA = {};
    const reqB = {};
    const route = "/api/me/profile";
    expect(c.record(`${ORIGIN}/rest/v1/profiles`, { route, requestKey: reqA, userAgent: "iPhone" })).toBe(true);
    c.record(`${ORIGIN}/rest/v1/profiles`, { route, requestKey: reqA, userAgent: "iPhone" });
    c.record(`${ORIGIN}/rpc/x`, { route, requestKey: reqB, userAgent: "iPhone" });
    expect(c.record("https://other.example.com/x", { route, requestKey: reqA, userAgent: null })).toBe(false);
    const rows = c.drain();
    const r = rows.find((x) => x.category === SUPABASE_ROUTE_CATEGORY)!;
    expect(r.metric).toBe("api.me.profile");
    expect(r.event_count).toBe(3);
    expect(r.value_count).toBe(2);
    expect(r.value_max).toBe(2);
    expect(rows.filter((x) => x.category === SUPABASE_TARGET_CATEGORY).reduce((s, x) => s + x.event_count, 0)).toBe(3);
    expect(c.drain()).toEqual([]);
  });
  it("시험 기기 UA 는 별도 category", () => {
    const c = new SupabaseCallCounter(ORIGIN);
    c.record(`${ORIGIN}/rest/v1/profiles`, {
      route: "/api/me/profile",
      requestKey: {},
      userAgent: "Mozilla/5.0 (Linux; Android 16; SM-M156S Build/x; wv)",
    });
    expect(c.drain().some((x) => x.category === SUPABASE_ROUTE_TEST_CATEGORY)).toBe(true);
  });
});

describe("sendSupabaseCallRollup", () => {
  it("128행씩 RPC 로 보낸다 — 서비스 키 헤더", async () => {
    const calls: Array<{ url: string; body: { p_rows: unknown[] } }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response("1", { status: 200 });
    }) as unknown as typeof fetch;
    const rows = Array.from({ length: 130 }, (_, i) => ({
      category: SUPABASE_TARGET_CATEGORY,
      metric: `rest.t${i}`,
      outcome: "" as const,
      event_count: 1,
      value_count: 0,
      value_sum: 0,
      value_max: null,
      dropped_count: 0,
    }));
    await sendSupabaseCallRollup(rows, { supabaseOrigin: ORIGIN, serviceKey: "k", fetchImpl });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe(`${ORIGIN}/rest/v1/rpc/cm_monitoring_rollup_add`);
    expect(calls[0]!.body.p_rows).toHaveLength(128);
    expect(calls[1]!.body.p_rows).toHaveLength(2);
  });
});

describe("installSupabaseCallCounter — 원래 fetch 동작 보존", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
    delete (globalThis as Record<symbol, unknown>)[Symbol.for("dibay.supabaseCallCounter.installed")];
  });

  it("원래 fetch 결과를 그대로 돌려주고, 셈이 실패해도 요청은 진행된다", async () => {
    const base = vi.fn(async () => new Response("ok", { status: 201 })) as unknown as typeof fetch;
    (base as unknown as Record<string, unknown>).__nextPatched = true;
    globalThis.fetch = base;
    const counter = installSupabaseCallCounter({
      supabaseUrl: ORIGIN,
      serviceKey: "k",
      readContext: () => {
        throw new Error("context broken");
      },
    });
    expect(counter).not.toBeNull();
    expect(globalThis.fetch).not.toBe(base);
    expect((globalThis.fetch as unknown as Record<string, unknown>).__nextPatched).toBe(true);
    const res = await globalThis.fetch(`${ORIGIN}/rest/v1/profiles`, { method: "GET" });
    expect(res.status).toBe(201);
    expect(base).toHaveBeenCalledWith(`${ORIGIN}/rest/v1/profiles`, { method: "GET" });
  });

  it("Supabase 호출만 센다", async () => {
    globalThis.fetch = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const counter = installSupabaseCallCounter({
      supabaseUrl: ORIGIN,
      serviceKey: "k",
      readContext: () => ({ route: "/api/me/profile", requestKey: null, userAgent: null }),
    })!;
    await globalThis.fetch(`${ORIGIN}/rest/v1/profiles`);
    await globalThis.fetch(new URL("https://example.com/a"));
    await globalThis.fetch(new Request(`${ORIGIN}/rest/v1/rpc/f`, { method: "POST" }));
    expect(counter.pending).toBe(2);
  });

  it("두 번 설치해도 한 번만 감싼다", () => {
    globalThis.fetch = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    const opts = { supabaseUrl: ORIGIN, serviceKey: "k", readContext: () => ({ route: null, requestKey: null, userAgent: null }) };
    const a = installSupabaseCallCounter(opts);
    const f1 = globalThis.fetch;
    const b = installSupabaseCallCounter(opts);
    expect(b).toBe(a);
    expect(globalThis.fetch).toBe(f1);
  });
});

describe("shouldInstallSupabaseCallCounter", () => {
  it("운영(VERCEL_ENV=production)이면 설치 — 실행 중 환경에 NEXT_RUNTIME 이 없어도(운영 실제 상태)", () => {
    expect(shouldInstallSupabaseCallCounter({ VERCEL_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
    expect(shouldInstallSupabaseCallCounter({ VERCEL_ENV: "preview" } as NodeJS.ProcessEnv)).toBe(false);
    expect(shouldInstallSupabaseCallCounter({ VERCEL_ENV: "production", SUPABASE_CALL_COUNTER: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(shouldInstallSupabaseCallCounter({ SUPABASE_CALL_COUNTER: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });
  it("instrumentation.ts 가 런타임을 빌드 시점 글자(process.env.NEXT_RUNTIME)로 거른다", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(`${process.cwd()}/instrumentation.ts`, "utf8");
    expect(src).toContain('process.env.NEXT_RUNTIME === "nodejs"');
  });
});
