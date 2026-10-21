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

describe("store-orders-sla-scan heartbeat", () => {
  it("scan ok → touches sla_scan heartbeat once", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const res = await GET(new Request("https://x.test/api/cron/store-orders-sla-scan"));
    expect(res.status).toBe(200);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["scan_store_order_sla_warnings", "touch_delivery_operation_job_heartbeat"]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_job_key: "sla_scan", p_ok: true });
  });

  it("scan error → 500 and no heartbeat", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await GET(new Request("https://x.test/api/cron/store-orders-sla-scan"));
    expect(res.status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("heartbeat failure does not fail the scan response", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: { message: "hb" } });
    const res = await GET(new Request("https://x.test/api/cron/store-orders-sla-scan"));
    expect(res.status).toBe(200);
  });
});
