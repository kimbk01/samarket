/**
 * v4 W1 API-02~07 — 관리자 쓰기·구매자 PII 조회 = `requireAdminPermission("business")`.
 * `business` 권한 없는 관리자 = 403, DB 클라이언트 미생성. 권한이 있으면 기존 처리로 진행(DB 미구성 → 503 = 통과 증거).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let permOk = false;
const permCalls: string[] = [];
const storesSb = vi.fn(() => null);
const serviceSb = vi.fn(() => null);

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async (key: string) => {
    permCalls.push(key);
    return permOk
      ? { ok: true, actor: { userId: "admin-1" } }
      : {
          ok: false,
          response: new Response(JSON.stringify({ ok: false, error: "forbidden_permission" }), { status: 403 }),
        };
  },
}));
// 기존 관리자 전원 검사는 통과시켜 권한 키 검사만 판정 대상으로 남긴다.
vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: async () => ({ ok: true, userId: "admin-1" }),
}));
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "admin-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => storesSb() }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => serviceSb() }));

import { PATCH as patchCommercial } from "@/app/api/admin/delivery-ads/commercial/route";
import { POST as postMessage } from "@/app/api/admin/delivery-ads/[campaignId]/messages/route";
import { POST as postMessageRead } from "@/app/api/admin/delivery-ads/[campaignId]/messages/read/route";
import { POST as postAdminBanner } from "@/app/api/admin/delivery-ads/upload-banner-image/route";
import {
  DELETE as deleteSound,
  POST as postSound,
  PUT as putSound,
} from "@/app/api/admin/store-delivery-alert-sound/route";
import { PUT as putComposition } from "@/app/api/admin/stores-composition-policy/route";
import { PUT as putBeforeRestBanner } from "@/app/api/admin/stores-home-before-rest-banner/route";
import { GET as getStoreOrders } from "@/app/api/admin/store-orders/route";
import { GET as getStoreOrdersList } from "@/app/api/admin/store-orders/list/route";
import { GET as getStoreOrderDetail } from "@/app/api/admin/store-orders/[orderId]/detail/route";
import { GET as getStoreOrderHistory } from "@/app/api/admin/store-orders/[orderId]/history/route";
import { GET as getStoreOrdersExport } from "@/app/api/admin/store-orders/export/route";

const json = (body: unknown, method = "POST") =>
  new Request("http://localhost/api/admin/x", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
const form = () => {
  const fd = new FormData();
  return new Request("http://localhost/api/admin/x", { method: "POST", body: fd }) as never;
};
const get = (q = "") => new Request(`http://localhost/api/admin/store-orders${q}`) as never;
const campaignCtx = { params: Promise.resolve({ campaignId: "c1" }) } as never;
const orderCtx = { params: Promise.resolve({ orderId: "o1" }) } as never;

beforeEach(() => {
  permOk = false;
  permCalls.length = 0;
  storesSb.mockClear();
  serviceSb.mockClear();
});

describe("API-02~06 관리자 쓰기 = business", () => {
  it("business 권한 없음 → 쓰기 10경로 모두 403, DB 클라이언트 미생성", async () => {
    const results = await Promise.all([
      patchCommercial(json({ op: "x" }, "PATCH")),
      postMessage(json({}), campaignCtx),
      postMessageRead(json({}), campaignCtx),
      postAdminBanner(form()),
      postSound(form()),
      deleteSound(json({ reason: "x" }, "DELETE")),
      putSound(json({ url: null }, "PUT")),
      putComposition(json({}, "PUT")),
      putBeforeRestBanner(json({}, "PUT")),
    ]);
    expect(results.map((r) => r.status)).toEqual(Array(9).fill(403));
    expect(permCalls).toEqual(Array(9).fill("business"));
    expect(storesSb).not.toHaveBeenCalled();
    expect(serviceSb).not.toHaveBeenCalled();
  });

  it("business 권한 있으면 권한 단계를 통과한다(403 아님)", async () => {
    permOk = true;
    expect((await patchCommercial(json({ op: "x" }, "PATCH"))).status).toBe(503);
    expect((await postMessage(json({}), campaignCtx)).status).toBe(503);
    expect((await postMessageRead(json({}), campaignCtx)).status).toBe(503);
    expect((await postAdminBanner(form())).status).toBe(503);
    expect((await postSound(form())).status).not.toBe(403);
  });
});

describe("API-07 관리자 주문 PII 조회 = business", () => {
  it("business 권한 없음 → 목록·list·상세·이력·내보내기 403", async () => {
    const results = await Promise.all([
      getStoreOrders(get()),
      getStoreOrdersList(get()),
      getStoreOrderDetail(get(), orderCtx),
      getStoreOrderHistory(get(), orderCtx),
      getStoreOrdersExport(get()),
    ]);
    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    expect(permCalls).toEqual(["business", "business", "business", "business", "business"]);
    expect(storesSb).not.toHaveBeenCalled();
  });

  it("business 권한 있으면 기존 처리로 진행(DB 미구성 → 503)", async () => {
    permOk = true;
    expect((await getStoreOrders(get())).status).toBe(503);
    expect((await getStoreOrderDetail(get(), orderCtx)).status).not.toBe(403);
  });
});
