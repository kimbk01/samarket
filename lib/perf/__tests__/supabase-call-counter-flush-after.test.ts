/**
 * 2026-11-22 계수기 전송을 요청 수명에 묶는다 — 전송할 때면 그 요청의 응답 뒤 작업(after)으로 예약.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/budget-alert-7-routes-and-counter-loss-2026-11-22.md
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { installSupabaseCallCounter } from "@/lib/perf/supabase-call-counter";

const ORIGIN = "https://proj.supabase.co";
const g = globalThis as Record<symbol, unknown>;
const original = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = original;
  delete g[Symbol.for("dibay.supabaseCallCounter.installed")];
  delete g[Symbol.for("dibay.supabaseCallCounter.readContext")];
  vi.useRealTimers();
});

function setup(scheduleAfter?: (t: () => Promise<void>) => boolean) {
  const sent: string[] = [];
  const base = vi.fn(async (input: unknown) => {
    const href = typeof input === "string" ? input : String(input);
    if (href.includes("cm_monitoring_rollup_add")) sent.push(href);
    return new Response("ok");
  });
  globalThis.fetch = base as unknown as typeof fetch;
  const key = {};
  const counter = installSupabaseCallCounter({
    supabaseUrl: ORIGIN,
    serviceKey: "k",
    readContext: () => ({ route: "/api/me/profile", requestKey: key, userAgent: null }),
    scheduleAfter,
  })!;
  return { counter, sent, base };
}

describe("응답 뒤 전송", () => {
  it("5분 전엔 전송하지 않고, 지나면 응답 뒤 작업으로 1번만 예약 → 실행 때 전송", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-22T00:00:00Z") });
    const tasks: (() => Promise<void>)[] = [];
    const { sent } = setup((t) => (tasks.push(t), true));
    await globalThis.fetch(`${ORIGIN}/rest/v1/a`);
    expect(tasks).toHaveLength(0);
    vi.setSystemTime(Date.parse("2026-11-22T00:05:01Z"));
    await globalThis.fetch(`${ORIGIN}/rest/v1/b`);
    await globalThis.fetch(`${ORIGIN}/rest/v1/c`);
    expect(tasks).toHaveLength(1); // 이미 예약 → 다시 예약 안 함
    expect(sent).toHaveLength(0); // 응답 뒤에 보냄
    await tasks[0]!();
    expect(sent).toHaveLength(1);
  });

  it("요청 밖(예약 못 함) → 바로 전송", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-22T00:00:00Z") });
    const { sent } = setup(() => false);
    vi.setSystemTime(Date.parse("2026-11-22T00:05:01Z"));
    await globalThis.fetch(`${ORIGIN}/rest/v1/a`);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
  });

  it("예약이 실행되지 않고 남아도 5분 뒤 다시 예약(전송이 멈추지 않음)", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-22T00:00:00Z") });
    const tasks: (() => Promise<void>)[] = [];
    setup((t) => (tasks.push(t), true));
    vi.setSystemTime(Date.parse("2026-11-22T00:05:01Z"));
    await globalThis.fetch(`${ORIGIN}/rest/v1/a`);
    expect(tasks).toHaveLength(1);
    vi.setSystemTime(Date.parse("2026-11-22T00:10:02Z"));
    await globalThis.fetch(`${ORIGIN}/rest/v1/b`);
    expect(tasks).toHaveLength(2);
  });

  it("예약 함수가 던져도 요청은 진행되고 바로 전송으로", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-22T00:00:00Z") });
    const { sent } = setup(() => {
      throw new Error("after unavailable");
    });
    vi.setSystemTime(Date.parse("2026-11-22T00:05:01Z"));
    const res = await globalThis.fetch(`${ORIGIN}/rest/v1/a`);
    expect(res.ok).toBe(true);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
  });

  it("예약 함수를 쓰면 5분 타이머를 만들지 않는다", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    setup(() => true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
