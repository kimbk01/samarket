/**
 * 3-E — 메뉴 카테고리: PRD-11(순서 한 트랜잭션 RPC) · PRD-13(소속 상품 있으면 409 → moveTo 이동 후 삭제) ·
 * PRD-15(500 원문 미노출).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeStoreSupabase,
  filterValue,
  type FakeCall,
  type FakeResult,
} from "@/lib/stores/__tests__/helpers/fake-store-supabase";

const bump = vi.fn();
let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
let fake = createFakeStoreSupabase((c) => handler(c));
let rpcResult: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null };
const rpcCalls: Array<[string, unknown]> = [];

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: async () => ({ ok: true, profile: {} }),
  requirePhoneVerified: async () => ({ ok: true, profile: {} }),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/stores/owner-product-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stores/owner-product-gate")>();
  return {
    ...actual,
    getStoreIfOwner: async () => ({ ok: true, store: { id: "store-1", approval_status: "approved" } }),
  };
});
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: (...a: unknown[]) => bump(...a),
}));
vi.mock("@/lib/stores/owner-products-list-snapshot", () => ({ invalidateOwnerProductsListCache: () => {} }));
vi.mock("@/lib/stores/store-menus-snapshot-invalidate-by-store-id", () => ({
  invalidateStoreMenusSnapshotCacheByStoreId: () => {},
}));

import { DELETE } from "@/app/api/me/stores/[storeId]/menu-sections/[sectionId]/route";
import { PUT } from "@/app/api/me/stores/[storeId]/menu-sections/order/route";
import { GET } from "@/app/api/me/stores/[storeId]/menu-sections/route";

const ctx = { params: Promise.resolve({ storeId: "store-1", sectionId: "sec-1" }) };

type Product = { id: string; menu_section_id: string | null; product_status: string };

function db(products: Product[], sections = ["sec-1", "sec-2"]) {
  const state = { products, sections: [...sections] };
  handler = (call) => {
    if (call.table === "store_menu_sections") {
      if (call.op === "delete") {
        const id = filterValue(call, "id");
        state.sections = state.sections.filter((s) => s !== id);
        for (const p of state.products) if (p.menu_section_id === id) p.menu_section_id = null; // FK SET NULL
        return { data: null, error: null };
      }
      const id = filterValue(call, "id");
      return { data: state.sections.includes(String(id)) ? { id } : null, error: null };
    }
    if (call.table === "store_products") {
      const sec = filterValue(call, "menu_section_id");
      if (call.op === "update") {
        for (const p of state.products) if (p.menu_section_id === sec) Object.assign(p, call.patch);
        return { data: null, error: null };
      }
      const count = state.products.filter((p) => p.menu_section_id === sec && p.product_status !== "deleted").length;
      return { data: null, error: null, count } as FakeResult;
    }
    return { data: null, error: null };
  };
  return state;
}

function del(qs = "") {
  return DELETE(new Request(`https://x.test/api/me/stores/store-1/menu-sections/sec-1${qs}`, { method: "DELETE" }), ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcCalls.length = 0;
  rpcResult = { data: { ok: true, updated: 2 }, error: null };
  fake = createFakeStoreSupabase((c) => handler(c));
  (fake.sb as unknown as { rpc: unknown }).rpc = async (fn: string, args: unknown) => {
    rpcCalls.push([fn, args]);
    return rpcResult;
  };
});

describe("PRD-13 DELETE section with products", () => {
  it("empty section (only soft-deleted products) deletes as before", async () => {
    const st = db([{ id: "p0", menu_section_id: "sec-1", product_status: "deleted" }]);
    const res = await del();
    expect(res.status).toBe(200);
    expect(st.sections).toEqual(["sec-2"]);
  });

  it("section with products → 409 section_has_products + count, nothing deleted", async () => {
    const st = db([
      { id: "p1", menu_section_id: "sec-1", product_status: "active" },
      { id: "p2", menu_section_id: "sec-1", product_status: "hidden" },
    ]);
    const res = await del();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "section_has_products", count: 2 });
    expect(st.sections).toContain("sec-1");
    expect(bump).not.toHaveBeenCalled();
  });

  it("?moveTo=<other section> moves every product (incl. soft-deleted) then deletes", async () => {
    const st = db([
      { id: "p1", menu_section_id: "sec-1", product_status: "active" },
      { id: "p0", menu_section_id: "sec-1", product_status: "deleted" },
    ]);
    const res = await del("?moveTo=sec-2");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, moved: 1, moved_to: "sec-2" });
    expect(st.sections).toEqual(["sec-2"]);
    expect(st.products.every((p) => p.menu_section_id === "sec-2")).toBe(true);
    expect(bump).toHaveBeenCalledWith("owner_store.menu_section_delete");
  });

  it("moveTo self / unknown section → 400 invalid_move_target", async () => {
    db([{ id: "p1", menu_section_id: "sec-1", product_status: "active" }]);
    expect((await del("?moveTo=sec-1")).status).toBe(400);
    const res = await del("?moveTo=sec-x");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_move_target");
  });
});

function put(body: unknown) {
  return PUT(
    new Request("https://x.test/api/me/stores/store-1/menu-sections/order", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ storeId: "store-1" }) }
  );
}

const A = "5ec00000-0000-0000-0000-000000000001";
const B = "5ec00000-0000-0000-0000-000000000002";

describe("PRD-11 PUT menu-sections/order", () => {
  it("one RPC call with the ordered ids; caches bumped", async () => {
    const res = await put({ section_ids: [B, A] });
    expect(res.status).toBe(200);
    expect(rpcCalls).toEqual([["reorder_store_menu_sections", { p_store_id: "store-1", p_section_ids: [B, A] }]]);
    expect(bump).toHaveBeenCalledWith("owner_store.menu_section_reorder");
  });

  it("invalid body → 400 without RPC", async () => {
    expect((await put({ section_ids: [] })).status).toBe(400);
    expect((await put({ section_ids: [A, A] })).status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it("foreign id (RPC section_not_in_store) → 400 invalid_section_ids, no bump", async () => {
    rpcResult = { data: null, error: { message: "section_not_in_store" } };
    const res = await put({ section_ids: [A] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_section_ids");
    expect(bump).not.toHaveBeenCalled();
  });

  it("function not deployed → 503 migration_pending; other errors → db_error", async () => {
    rpcResult = { data: null, error: { message: "Could not find the function public.reorder_store_menu_sections", code: "PGRST202" } };
    expect((await put({ section_ids: [A] })).status).toBe(503);
    rpcResult = { data: null, error: { message: "deadlock detected on secret_rel" } };
    const res = await put({ section_ids: [A] });
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j.error).toBe("db_error");
    expect(JSON.stringify(j)).not.toContain("secret_rel");
  });
});

describe("PRD-15 GET sections DB error", () => {
  it("500 is db_error, not the raw message", async () => {
    handler = () => ({ data: null, error: { message: "permission denied for relation secret_x" } });
    const res = await GET(new Request("https://x.test"), { params: Promise.resolve({ storeId: "store-1" }) });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret_x");
  });
});
