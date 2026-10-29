/**
 * 3-C §9-3 — 관리자 샘플 카탈로그 라우트: business 권한 + 서버 store_kind='sample' 재검증 후 오너와 같은 코어 호출.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let permOk = true;
let storeRow: Record<string, unknown> | null = null;
const createCore = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ ok: true, product: { id: "p1" } }), { status: 200 }));
const sectionsCore = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ ok: true, sections: [] }), { status: 200 }));
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
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({
    from: () => {
      const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: storeRow, error: null }) };
      return b;
    },
  }),
}));
vi.mock("@/lib/stores/owner-catalog/products-core.server", () => ({
  createStoreProductCore: (...a: unknown[]) => createCore(...a),
  patchStoreProductCore: vi.fn(),
  loadProductForOwner: vi.fn(),
}));
vi.mock("@/lib/stores/owner-catalog/menu-sections-core.server", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/stores/owner-catalog/menu-sections-core.server");
  return { ...actual, listMenuSectionsCore: (...a: unknown[]) => sectionsCore(...a) };
});

import { POST as createProduct } from "@/app/api/admin/stores/[id]/sample-catalog/products/route";
import { GET as listSections } from "@/app/api/admin/stores/[id]/sample-catalog/menu-sections/route";
import { catalogActorRequiresSalesApproval } from "@/lib/stores/owner-catalog/store-catalog-actor";

const ctx = { params: Promise.resolve({ id: "store-1" }) };
const post = () =>
  new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }) as never;

beforeEach(() => {
  permOk = true;
  storeRow = { id: "store-1", owner_user_id: null, approval_status: "approved", owner_can_edit_store_identity: false, store_kind: "sample", slug: "s" };
  createCore.mockClear();
  sectionsCore.mockClear();
  audit.mockClear();
});

describe("3-C admin sample catalog routes", () => {
  it("business 권한 없으면 403 (코어 미호출)", async () => {
    permOk = false;
    const res = await createProduct(post(), ctx);
    expect(res.status).toBe(403);
    expect(createCore).not.toHaveBeenCalled();
  });

  it("실매장·테스트 매장은 403 not_sample_store (실매장 관리자 메뉴 편집 확대 없음)", async () => {
    for (const kind of ["real", "legacy_test"]) {
      storeRow = { ...storeRow!, store_kind: kind, owner_user_id: "owner-1" };
      const res = await createProduct(post(), ctx);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("not_sample_store");
    }
    expect(createCore).not.toHaveBeenCalled();
  });

  it("없는 매장은 404", async () => {
    storeRow = null;
    const res = await listSections(new Request("http://localhost/x") as never, ctx);
    expect(res.status).toBe(404);
  });

  it("샘플 매장은 오너와 같은 코어를 admin_sample 주체로 호출 + 감사", async () => {
    const res = await createProduct(post(), ctx);
    expect(res.status).toBe(200);
    expect(createCore).toHaveBeenCalledTimes(1);
    const [, sid, actor] = createCore.mock.calls[0]!;
    expect(sid).toBe("store-1");
    expect(actor).toEqual({ kind: "admin_sample", userId: "admin-1" });
    expect((audit.mock.calls[0]?.[1] as { action: string }).action).toBe("store.admin_sample_catalog.product_create");
    const list = await listSections(new Request("http://localhost/x") as never, ctx);
    expect(list.status).toBe(200);
    expect(sectionsCore).toHaveBeenCalledWith(expect.anything(), "store-1");
  });

  it("판매 승인 게이트는 오너만 (샘플은 판매 권한이 영구히 없음)", () => {
    expect(catalogActorRequiresSalesApproval({ kind: "owner", userId: "u" })).toBe(true);
    expect(catalogActorRequiresSalesApproval({ kind: "admin_sample", userId: "a" })).toBe(false);
  });
});
