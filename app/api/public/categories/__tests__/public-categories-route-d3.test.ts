import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** D3 — 공개 카테고리 API: anon 읽기 · 활성만 · CDN 캐시(성공) / 캐시 금지(실패·잘못된 type) */
const created: Array<{ url: string; key: string }> = [];
const eqCalls: Array<[string, unknown]> = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("@/lib/env/runtime", () => ({
  requireSupabaseEnv: () => ({ ok: true, url: "https://x.supabase.co", anonKey: "anon-key", serviceKey: "svc" }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string) => {
    created.push({ url, key });
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.select = () => chain;
    chain.eq = (c: string, v: unknown) => {
      eqCalls.push([c, v]);
      return chain;
    };
    chain.order = async () => result;
    return chain;
  },
}));

async function call(qs = "") {
  const { GET } = await import("@/app/api/public/categories/route");
  return GET(new NextRequest(`https://app.test/api/public/categories${qs}`));
}

describe("GET /api/public/categories (D3)", () => {
  beforeEach(() => {
    vi.resetModules();
    created.length = 0;
    eqCalls.length = 0;
    result = { data: [{ id: "a" }], error: null };
  });

  it("anon 키로 읽고 활성·type 필터를 건다, 성공은 CDN 캐시", async () => {
    const res = await call("?type=trade");
    expect(res.status).toBe(200);
    expect(created[0]?.key).toBe("anon-key");
    expect(eqCalls).toContainEqual(["is_active", true]);
    expect(eqCalls).toContainEqual(["type", "trade"]);
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.json()).toEqual({ ok: true, rows: [{ id: "a" }] });
  });

  it("허용되지 않은 type 은 400 · 캐시 금지 · DB 조회 없음", async () => {
    const res = await call("?type=admin");
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(created.length).toBe(0);
  });

  it("조회 실패는 ok:false · 캐시 금지", async () => {
    result = { data: null, error: { message: "boom", code: "XX000" } };
    const res = await call();
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});
