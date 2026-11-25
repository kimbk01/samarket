import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const timeoutJob = vi.fn();
const remindersJob = vi.fn();
vi.mock("@/lib/stores/cron/store-orders-accept-timeout-job", () => ({
  runStoreOrdersAcceptTimeoutJob: (...a: unknown[]) => timeoutJob(...a),
}));
vi.mock("@/lib/stores/cron/store-order-accept-reminders-job", () => ({
  runStoreOrderAcceptRemindersJob: (...a: unknown[]) => remindersJob(...a),
}));

import { hasPendingPaidStoreOrders, runStoreOrdersMinuteTick } from "@/lib/stores/cron/store-orders-minute-tick";
import { STORE_ORDER_AUTOMATION_FROM_ISO } from "@/lib/stores/store-order-lifecycle-automation";

type Call = { method: string; args: unknown[] };

function fakeSb(result: { data: unknown; error: { message: string } | null }) {
  const calls: Call[] = [];
  let fromCount = 0;
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "order"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return chain;
    };
  }
  chain.limit = (...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve(result);
  };
  const sb = {
    from: (table: string) => {
      fromCount += 1;
      calls.push({ method: "from", args: [table] });
      return chain;
    },
  };
  return { sb: sb as never, calls, fromCount: () => fromCount };
}

const RM = { ip: null, userAgent: null };

beforeEach(() => {
  timeoutJob.mockReset();
  remindersJob.mockReset();
  timeoutJob.mockResolvedValue({ ok: true, cancelled: 0, order_ids: [] });
  remindersJob.mockResolvedValue({ ok: true, scanned: 1, reminded_30s: 0, reminded_60s: 0 });
});

describe("hasPendingPaidStoreOrders — 두 작업 조건의 상위 집합으로 1행만 확인", () => {
  it("조건: pending·paid·자동화 기준 이후·지금 이전, 1행", async () => {
    const f = fakeSb({ data: [], error: null });
    await expect(hasPendingPaidStoreOrders(f.sb)).resolves.toBe(false);
    expect(f.calls).toEqual(
      expect.arrayContaining([
        { method: "from", args: ["store_orders"] },
        { method: "select", args: ["id"] },
        { method: "eq", args: ["order_status", "pending"] },
        { method: "eq", args: ["payment_status", "paid"] },
        { method: "gte", args: ["created_at", STORE_ORDER_AUTOMATION_FROM_ISO] },
        { method: "limit", args: [1] },
      ])
    );
    expect(f.calls.some((c) => c.method === "lte" && c.args[0] === "created_at")).toBe(true);
  });
  it("행 있음 → true · 오류 → null", async () => {
    await expect(hasPendingPaidStoreOrders(fakeSb({ data: [{ id: "o1" }], error: null }).sb)).resolves.toBe(true);
    await expect(hasPendingPaidStoreOrders(fakeSb({ data: null, error: { message: "x" } }).sb)).resolves.toBeNull();
  });
});

describe("runStoreOrdersMinuteTick", () => {
  it("대기 주문 없음 → Supabase 1번(확인)만, 두 작업 실행 안 함", async () => {
    const f = fakeSb({ data: [], error: null });
    const r = await runStoreOrdersMinuteTick(f.sb, RM);
    expect(r).toMatchObject({ ok: true, pending: false, skipped: true });
    expect(f.fromCount()).toBe(1);
    expect(timeoutJob).not.toHaveBeenCalled();
    expect(remindersJob).not.toHaveBeenCalled();
  });
  it("대기 주문 있음 → 자동 취소 → 독촉 순서로 지금 함수 그대로 실행", async () => {
    const order: string[] = [];
    timeoutJob.mockImplementation(async () => {
      order.push("timeout");
      return { ok: true, cancelled: 1, order_ids: ["o1"] };
    });
    remindersJob.mockImplementation(async () => {
      order.push("reminders");
      return { ok: true, scanned: 2, reminded_30s: 1, reminded_60s: 0 };
    });
    const f = fakeSb({ data: [{ id: "o1" }], error: null });
    const r = await runStoreOrdersMinuteTick(f.sb, RM);
    expect(order).toEqual(["timeout", "reminders"]);
    expect(timeoutJob).toHaveBeenCalledWith(f.sb, RM);
    expect(remindersJob).toHaveBeenCalledWith(f.sb);
    expect(r).toMatchObject({ ok: true, pending: true, skipped: false, accept_timeout: { cancelled: 1 } });
  });
  it("확인 실패 → 놓치지 않게 두 작업 그대로 실행", async () => {
    const r = await runStoreOrdersMinuteTick(fakeSb({ data: null, error: { message: "boom" } }).sb, RM);
    expect(r.pending).toBeNull();
    expect(timeoutJob).toHaveBeenCalledTimes(1);
    expect(remindersJob).toHaveBeenCalledTimes(1);
  });
  it("한 작업 예외가 다른 작업을 막지 않는다", async () => {
    timeoutJob.mockRejectedValue(new Error("t_fail"));
    const r = await runStoreOrdersMinuteTick(fakeSb({ data: [{ id: "o1" }], error: null }).sb, RM);
    expect(remindersJob).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    expect(r.accept_timeout).toEqual({ ok: false, error: "t_fail" });
    expect(r.accept_reminders).toMatchObject({ ok: true });
  });
});

describe("예약 계약 — vercel.json", () => {
  const crons = (
    JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    }
  ).crons;
  it("주문 1분 tick 1개, 예전 주문 cron 2개는 예약에서 빠짐(수동 라우트는 남음)", () => {
    expect(crons.filter((c) => c.path === "/api/cron/store-orders-minute-tick")).toEqual([
      { path: "/api/cron/store-orders-minute-tick", schedule: "* * * * *" },
    ]);
    expect(crons.some((c) => c.path === "/api/cron/store-orders-accept-timeout")).toBe(false);
    expect(crons.some((c) => c.path === "/api/cron/store-order-accept-reminders")).toBe(false);
  });
  it("통화 대상 채팅 푸시 복구 cron 은 그대로 1분", () => {
    expect(crons.filter((c) => c.path === "/api/cron/notification-push-handoff")).toEqual([
      { path: "/api/cron/notification-push-handoff", schedule: "* * * * *" },
    ]);
  });
});
