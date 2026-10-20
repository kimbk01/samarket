/**
 * 1-J — 공개 상품 상세: PRD-03(검수 반려·재검수 대기) · PRD-05(숨김 구역) 상품은 메뉴판과 같이 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeStoreSupabase,
  type FakeCall,
  type FakeResult,
} from "@/lib/stores/__tests__/helpers/fake-store-supabase";

let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
let fake = createFakeStoreSupabase((c) => handler(c));

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => null }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/stores/store-orderability-policy", () => ({
  resolveStoreOrderability: async () => ({
    viewer_is_owner: false,
    viewer_is_admin: false,
    can_order_store: true,
    owner_block_message: null,
  }),
}));

import { GET } from "@/app/api/stores/products/[productId]/route";

function scenario(product: Record<string, unknown>) {
  handler = (call) => {
    if (call.table === "store_products") return { data: product, error: null };
    if (call.table === "stores") {
      return { data: { id: "store-1", owner_user_id: "o", approval_status: "approved", is_visible: true }, error: null };
    }
    if (call.table === "store_sales_permissions") {
      return { data: { allowed_to_sell: true, sales_status: "approved" }, error: null };
    }
    return { data: null, error: null };
  };
}

const base = {
  id: "p-1",
  store_id: "store-1",
  product_status: "active",
  admin_review_status: "none",
  store_menu_sections: { id: "sec-1", name: "Main", sort_order: 0, is_hidden: false },
};

async function get() {
  return GET(new Request("https://x.test"), { params: Promise.resolve({ productId: "p-1" }) });
}

beforeEach(() => {
  fake = createFakeStoreSupabase((c) => handler(c));
});

describe("public product detail — visibility = orderability", () => {
  it("normal product 200 (review status not leaked)", async () => {
    scenario({ ...base });
    const res = await get();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.product.admin_review_status).toBeUndefined();
  });
  it("hidden section → 404", async () => {
    scenario({ ...base, store_menu_sections: { ...base.store_menu_sections, is_hidden: true } });
    expect((await get()).status).toBe(404);
  });
  it("re-review pending / rejected → 404", async () => {
    scenario({ ...base, admin_review_status: "pending" });
    expect((await get()).status).toBe(404);
    scenario({ ...base, admin_review_status: "rejected" });
    expect((await get()).status).toBe(404);
  });
});
