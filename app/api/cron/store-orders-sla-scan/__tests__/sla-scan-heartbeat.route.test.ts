/**
 * X-4 — SLA 스캔 크론 성공 시 관리자 배달 운영 상태 하트비트(sla_scan) 기록, 실패 시 미기록.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({ rpc }) }));
vi.mock("@/lib/security/cron-auth", () => ({ verifyCronRequestAuthorization: () => true }));

import { GET } from "@/app/api/cron/store-orders-sla-scan/route";

beforeEach(() => {
  rpc.mockReset();
  process.env.CRON_SECRET = "s";
});

/** 2026-11-19 tick 도입 — 이 묶음은 tick 함수가 없을 때(마이그레이션 전) 기존 경로를 검증한다 */
const TICK_MISSING = { data: null, error: { message: "function store_orders_sla_scan_tick does not exist" } };

describe("store-orders-sla-scan heartbeat (tick 없음 → 기존 경로)", () => {
  it("scan ok → touches sla_scan heartbeat once", async () => {
    rpc.mockResolvedValueOnce(TICK_MISSING);
    rpc.mockResolvedValue({ data: null, error: null });
    const res = await GET(new Request("https://x.test/api/cron/store-orders-sla-scan"));
    expect(res.status).toBe(200);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "store_orders_sla_scan_tick",
      "scan_store_order_sla_warnings",
      "touch_delivery_operation_job_heartbeat",
    ]);
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_job_key: "sla_scan", p_ok: true });
  });

  it("scan error → 500 and no heartbeat", async () => {
    rpc.mockResolvedValueOnce(TICK_MISSING);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await GET(new Request("https://x.test/api/cron/store-orders-sla-scan"));
    expect(res.status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("heartbeat failure does not fail the scan response", async () => {
    rpc
      .mockResolvedValueOnce(TICK_MISSING)
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "hb" } });
    const res = await GET(new Request("https://x.test/api/cron/store-orders-sla-scan"));
    expect(res.status).toBe(200);
  });
});

describe("store-orders-sla-scan tick (예약 작업 4번 — 실행 1번 = DB 함수 1번)", () => {
  it("검사·하트비트 성공 → Supabase 1번 · 200", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, v: 1, heartbeat_error: null }, error: null });
    const res = await GET(new Request("https://x.test/api/cron/store-orders-sla-scan"));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("store_orders_sla_scan_tick");
  });

  it("검사 실패 → 500 (하트비트는 DB 함수가 남기지 않음)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: { ok: false, v: 1, error: "boom" }, error: null });
    const res = await GET(new Request("https://x.test/api/cron/store-orders-sla-scan"));
    expect(res.status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it("하트비트 실패만 → 200 (지금처럼 로그만)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: { ok: true, v: 1, heartbeat_error: "hb" }, error: null });
    const res = await GET(new Request("https://x.test/api/cron/store-orders-sla-scan"));
    expect(res.status).toBe(200);
    err.mockRestore();
  });
});
