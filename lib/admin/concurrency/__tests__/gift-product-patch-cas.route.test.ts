import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from "./fake-supabase-query";

let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
const fake = createFakeSupabase((c) => handler(c));
const recordGiftAdminEvent = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin-1" }, sb: fake.sb }),
}));
vi.mock("@/lib/gift-certificate/record-gift-admin-event", () => ({
  recordGiftAdminEvent: (...a: unknown[]) => recordGiftAdminEvent(...a),
}));
vi.mock("@/lib/gift-certificate/admin-gift-product-detail", () => ({
  loadAdminGiftProductDetail: async () => null,
}));

import { PATCH } from "@/app/api/admin/gift-certificates/products/[id]/route";

const LOADED = "2026-10-19T01:00:00.123456+00:00";
const product = { id: "gp-1", title: "A", active: true, updated_at: LOADED };

function call(body: Record<string, unknown>) {
  return PATCH(
    new Request("https://x.test/api/admin/gift-certificates/products/gp-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id: "gp-1" }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
});

describe("gift product PATCH — CAS", () => {
  it("400 expected_updated_at_required without version", async () => {
    handler = () => ({ data: product, error: null });
    const res = await call({ title: "B" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("expected_updated_at_required");
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("409 stale_updated_at when the product changed after load", async () => {
    handler = () => ({ data: { ...product, updated_at: "2026-10-19T02:00:00+00:00" }, error: null });
    const res = await call({ title: "B", expected_updated_at: LOADED });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("stale_updated_at");
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
    expect(recordGiftAdminEvent).not.toHaveBeenCalled();
  });

  it("409 stale_updated_at when the conditional UPDATE matches 0 rows (also for actions)", async () => {
    handler = (c) => (c.op === "select" ? { data: product, error: null } : { data: null, error: null });
    const res = await call({ action: "pause", expected_updated_at: LOADED });
    expect(res.status).toBe(409);
    const upd = fake.calls.find((c) => c.op === "update")!;
    expect(filterValue(upd, "eq", "updated_at")).toBe(LOADED);
    expect(recordGiftAdminEvent).not.toHaveBeenCalled();
  });

  it("normal save succeeds and records the admin event", async () => {
    handler = (c) =>
      c.op === "select" ? { data: product, error: null } : { data: { ...product, title: "B" }, error: null };
    const res = await call({ title: "B", expected_updated_at: LOADED });
    expect(res.status).toBe(200);
    expect(recordGiftAdminEvent).toHaveBeenCalledTimes(1);
  });
});
