/**
 * 묶음 4 · A-07 — 배달 광고 쓰기 경로는 같은 도메인 `actions` 와 같은 `requireAdminPermission("business")`.
 * `business` 권한이 없는 관리자 = 403, 저장 함수 미호출. 읽기(GET)는 기존 관리자 검사 유지.
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
vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: async () => ({ ok: true, userId: "admin-1" }),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => storesSb() }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => serviceSb() }));

import { PATCH as patchCampaign } from "@/app/api/admin/delivery-ads/[campaignId]/route";
import { GET as getExtend, POST as postExtend } from "@/app/api/admin/delivery-ads/[campaignId]/extend/route";
import { POST as postFirstParty } from "@/app/api/admin/delivery-ads/first-party/route";
import { POST as postBusinessCash } from "@/app/api/admin/delivery-ads/business-cash/route";
import { PATCH as patchChargeRequest } from "@/app/api/admin/delivery-ads/business-cash/charge-requests/[id]/route";

const json = (body: unknown) =>
  new Request("http://localhost/api/admin/delivery-ads/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
const campaignCtx = { params: Promise.resolve({ campaignId: "c1" }) };

beforeEach(() => {
  permOk = false;
  permCalls.length = 0;
  storesSb.mockClear();
  serviceSb.mockClear();
});

describe("A-07 배달 광고 쓰기 권한 = business", () => {
  it("business 권한 없음 → 쓰기 5경로 모두 403, DB 클라이언트 미생성", async () => {
    const results = await Promise.all([
      patchCampaign(json({ productKind: "x" }), campaignCtx as never),
      postExtend(json({ productKind: "x" }), campaignCtx as never),
      postFirstParty(json({})),
      postBusinessCash(json({})),
      patchChargeRequest(json({}) as never, { params: Promise.resolve({ id: "r1" }) }),
    ]);
    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    expect(permCalls).toEqual(["business", "business", "business", "business", "business"]);
    expect(storesSb).not.toHaveBeenCalled();
    expect(serviceSb).not.toHaveBeenCalled();
  });

  it("business 권한 있으면 권한 검사를 통과해 기존 처리로 진행", async () => {
    permOk = true;
    // DB 미구성(null) → 503 = 권한 단계 통과 증거
    expect((await patchCampaign(json({ productKind: "x" }), campaignCtx as never)).status).toBe(503);
    expect((await postExtend(json({ productKind: "x" }), campaignCtx as never)).status).toBe(503);
    expect((await postFirstParty(json({}))).status).toBe(503);
    expect((await postBusinessCash(json({}))).status).not.toBe(403);
    expect((await patchChargeRequest(json({}) as never, { params: Promise.resolve({ id: "r1" }) })).status).toBe(410);
  });

  it("읽기(GET)는 기존 관리자 검사 유지 — business 권한 검사 없음", async () => {
    const res = await getExtend(
      new Request("http://localhost/api/admin/delivery-ads/c1/extend?productKind=x") as never,
      campaignCtx as never
    );
    expect(res.status).not.toBe(403);
    expect(permCalls).toEqual([]);
  });
});
