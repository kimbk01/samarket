/** 3-C B-2·B-3 — POST /api/admin/stores/bulk: 단건 PATCH 와 같은 실행 함수 · 매장별 결과 · 권한 403 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
let permOk = true;
const exec = vi.fn(async (input: { id: string; body: Record<string, unknown> }) =>
  input.id === B
    ? new Response(JSON.stringify({ ok: false, error: "store_not_approved_for_visibility" }), { status: 400 })
    : new Response(JSON.stringify({ ok: true }), { status: 200 })
);
const audit = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () =>
    permOk
      ? { ok: true, actor: { userId: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ ok: false, error: "forbidden_permission" }), { status: 403 }) },
}));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "admin-1" }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => audit(...a) }));
vi.mock("@/lib/audit/request-meta", () => ({ getAuditRequestMeta: () => ({ ip: null, userAgent: null }) }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/admin-business/execute-admin-store-patch-action.server", () => ({
  executeAdminStorePatchAction: (input: { id: string; body: Record<string, unknown> }) => exec(input),
}));

import { POST } from "@/app/api/admin/stores/bulk/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/admin/stores/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

beforeEach(() => {
  permOk = true;
  exec.mockClear();
  audit.mockClear();
});

describe("3-C admin stores bulk route", () => {
  it("권한 없으면 403", async () => {
    permOk = false;
    expect((await POST(req({ store_ids: [A], action: "set_store_visible", enabled: false, reason: "정리" }))).status).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it("허용 밖 동작·사유 없음은 400", async () => {
    expect((await POST(req({ store_ids: [A], action: "set_store_name", reason: "정리" }))).status).toBe(400);
    expect((await POST(req({ store_ids: [A], action: "set_store_visible", enabled: false }))).status).toBe(400);
    expect(exec).not.toHaveBeenCalled();
  });

  it("매장마다 단건 action 실행, 성공/실패 분리 + 요약 감사", async () => {
    const res = await POST(req({ store_ids: [A, B], action: "set_store_visible", enabled: true, reason: "오픈" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(exec.mock.calls.map((c) => c[0].body)).toEqual([
      { action: "set_store_visible", enabled: true, reason: "오픈" },
      { action: "set_store_visible", enabled: true, reason: "오픈" },
    ]);
    expect(json.summary).toEqual({ total: 2, success: 1, failed: 1 });
    expect(json.results.find((r: { store_id: string }) => r.store_id === B).error).toBe("store_not_approved_for_visibility");
    expect((audit.mock.calls[0]?.[1] as { action: string }).action).toBe("store.bulk.set_store_visible");
  });
});
