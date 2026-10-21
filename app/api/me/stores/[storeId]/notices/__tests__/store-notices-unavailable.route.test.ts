/**
 * OPS-01 — store_notices 테이블 부재를 빈 목록 성공으로 위장하지 않는다 (오너·공개 GET, 오너 POST → 503).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let noticesError: { code?: string; message: string } | null;
let noticesRows: unknown[];

function makeSb() {
  return {
    from(table: string) {
      let inserting = false;
      const result = () =>
        table === "store_notices"
          ? noticesError
            ? { data: null, error: noticesError }
            : { data: inserting ? { id: "n-1" } : noticesRows, error: null }
          : { data: { slug: "store-one" }, error: null };
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        order: () => b,
        insert: () => {
          inserting = true;
          return b;
        },
        maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => unknown) => resolve(result()),
      };
      return b;
    },
  };
}

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: async () => ({ ok: true }) }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: async () => ({ ok: true, store: { id: "store-1", approval_status: "approved" } }),
  getStoreIfOwnerForOperationalWrite: async () => ({ ok: true, store: { id: "store-1", approval_status: "approved" } }),
}));
vi.mock("@/lib/stores/get-approved-store-by-slug", () => ({
  STORE_SELECT_ID_SLUG_GATE: "id, slug",
  getApprovedStoreBySlug: async () => ({ ok: true, store: { id: "store-1" } }),
}));
vi.mock("@/lib/stores/revalidate-store-consumer-paths", () => ({ revalidateStoreConsumerPathsBySlug: vi.fn() }));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: vi.fn(),
}));

import { GET as ownerGet, POST as ownerPost } from "@/app/api/me/stores/[storeId]/notices/route";
import { GET as publicGet } from "@/app/api/stores/[slug]/notices/route";

const ownerCtx = { params: Promise.resolve({ storeId: "store-1" }) };
const publicCtx = { params: Promise.resolve({ slug: "store-one" }) };
const MISSING = { code: "PGRST205", message: "Could not find the table 'public.store_notices' in the schema cache" };

describe("OPS-01 store_notices unavailable → 503", () => {
  beforeEach(() => {
    noticesError = null;
    noticesRows = [];
  });

  it("owner GET: missing table → 503 store_notices_unavailable (not ok:true + empty)", async () => {
    noticesError = MISSING;
    const res = await ownerGet(new Request("http://x"), ownerCtx);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "store_notices_unavailable" });
  });

  it("public GET: missing table → 503", async () => {
    noticesError = MISSING;
    const res = await publicGet(new Request("http://x"), publicCtx);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("store_notices_unavailable");
  });

  it("owner POST: missing table → 503", async () => {
    noticesError = MISSING;
    const res = await ownerPost(
      new Request("http://x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "t", placement: "store_top" }),
      }) as never,
      ownerCtx
    );
    expect(res.status).toBe(503);
  });

  it("table present: owner GET returns the list as before", async () => {
    noticesRows = [{ id: "n-1", title: "t" }];
    const res = await ownerGet(new Request("http://x"), ownerCtx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { notices: unknown[] }).notices).toHaveLength(1);
  });
});
