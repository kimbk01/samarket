/**
 * v4 재감사 보완 r2 — API-12 관리자·라이더 오류 원문 제거 (응답 본문만, 서버 로그 유지).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RAW = 'relation "public.secret_table" does not exist';

const integrityLoader = vi.hoisted(() => ({ fn: vi.fn() }));
const riderDb = vi.hoisted(() => ({ error: null as { message: string } | null }));

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, sb: {}, actor: { userId: "admin-1" } }),
}));
vi.mock("@/lib/stores/commission/load-store-commission-ledger", () => ({
  loadStoreCommissionIntegrity: (...a: unknown[]) => integrityLoader.fn(...a),
}));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "rider-user" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "in"]) b[m] = () => b;
      b.then = (resolve: (r: unknown) => unknown) =>
        Promise.resolve({ data: null, error: riderDb.error }).then(resolve);
      return b;
    },
  }),
}));
vi.mock("@/lib/stores/store-order-delivery-service", () => ({
  STORE_ORDER_DELIVERY_ROW_SELECT: "*",
  getDeliveryRiderForUser: async () => ({ ok: true, rider: { id: "rider-1" } }),
}));

import { NextRequest } from "next/server";
import { serviceErrorResponse } from "@/lib/security/internal-error-response";
import { GET as getIntegrity } from "@/app/api/admin/store-commission-ledger/integrity/route";
import { GET as getRiderOrders } from "@/app/api/me/rider/orders/route";

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  integrityLoader.fn.mockReset();
  riderDb.error = null;
});
afterEach(() => {
  errSpy.mockRestore();
});

describe("serviceErrorResponse — 서비스 결과 오류", () => {
  it("5xx 원문은 고정 코드로 바꾸고 원문은 서버 로그로만", async () => {
    const res = serviceErrorResponse(RAW, 500, "save_failed", "[t]");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "save_failed" });
    expect(text).not.toContain("secret_table");
    expect(errSpy).toHaveBeenCalledWith("[t]", "save_failed", RAW);
  });

  it("업무 코드(4xx·5xx snake_case)는 그대로 유지", async () => {
    const a = serviceErrorResponse("rider_not_assigned_to_order", 403, "save_failed", "[t]");
    expect(a.status).toBe(403);
    expect(await a.json()).toEqual({ ok: false, error: "rider_not_assigned_to_order" });
    const b = serviceErrorResponse("rider_schema_missing_apply_migration", 503, "load_failed", "[t]");
    expect(b.status).toBe(503);
    expect(await b.json()).toEqual({ ok: false, error: "rider_schema_missing_apply_migration" });
  });
});

describe("관리자 수수료 원장 integrity — 예외 원문 미노출", () => {
  it("로더 예외 → 500 load_failed, 본문에 원문 없음, 서버 로그 유지", async () => {
    integrityLoader.fn.mockRejectedValue(new Error(RAW));
    const res = await getIntegrity(new NextRequest("https://x.test/api/admin/store-commission-ledger/integrity"));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "load_failed" });
    expect(text).not.toContain("secret_table");
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("라이더 주문 목록 — DB 오류 원문 미노출", () => {
  it("배달 조회 오류 → 500 load_failed", async () => {
    riderDb.error = { message: RAW };
    const res = await getRiderOrders();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: false, error: "load_failed" });
    expect(text).not.toContain("secret_table");
  });
});

describe("대상 라우트 소스 — 원문(message·detail) 응답 패턴 없음", () => {
  const root = process.cwd();
  const files = [
    "app/api/admin/delivery-ads/route.ts",
    "app/api/admin/store-commission-ledger/route.ts",
    "app/api/admin/store-commission-ledger/cash-ledger/route.ts",
    "app/api/admin/store-commission-ledger/integrity/route.ts",
    "app/api/admin/store-commission-ledger/payable/route.ts",
    "app/api/admin/store-fee-policies/route.ts",
    "app/api/admin/store-fee-policies/[id]/route.ts",
    "app/api/admin/store-fee-policies/overview/route.ts",
    "app/api/admin/store-point-charges/route.ts",
    "app/api/admin/store-point-ledger/route.ts",
    "app/api/admin/store-point-policies/route.ts",
    "app/api/admin/store-points/route.ts",
    "app/api/admin/store-points/summary/route.ts",
    "app/api/me/rider/bootstrap/route.ts",
    "app/api/me/rider/orders/route.ts",
    "app/api/me/rider/orders/[orderId]/route.ts",
    "app/api/me/rider/orders/[orderId]/pod-upload/route.ts",
  ];
  it.each(files)("%s", (rel) => {
    const src = readFileSync(path.join(root, rel), "utf8");
    expect(src).not.toMatch(/error:\s*[A-Za-z_.]*(?:error|Err|Res\.error)\.message\b/);
    expect(src).not.toMatch(/error:\s*message\b/);
    expect(src).not.toMatch(/detail:\s*result\.error/);
    expect(src).not.toMatch(/_error:\s*[A-Za-z_.]*\.message/);
    expect(src).not.toMatch(/error:\s*raw\s*\|\|/);
  });
});
