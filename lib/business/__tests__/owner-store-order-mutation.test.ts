import { describe, expect, it, vi, beforeEach } from "vitest";
import { runOwnerStoreOrderPatch } from "@/lib/business/owner-store-order-mutation";

vi.mock("@/lib/business/patch-owner-store-order-status", () => ({
  patchOwnerStoreOrderStatus: vi.fn(),
  postOwnerStoreOrderCancelRequest: vi.fn(),
}));

vi.mock("@/lib/business/fetch-owner-store-order-detail", () => ({
  fetchOwnerStoreOrderDetailDeduped: vi.fn(),
  ownerStoreOrderDetailFlightKey: (s: string, o: string) => `detail:${s}:${o}`,
}));

import { patchOwnerStoreOrderStatus } from "@/lib/business/patch-owner-store-order-status";
import { fetchOwnerStoreOrderDetailDeduped } from "@/lib/business/fetch-owner-store-order-detail";

describe("runOwnerStoreOrderPatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("patches list row on success with order_status from API", async () => {
    vi.mocked(patchOwnerStoreOrderStatus).mockResolvedValue({
      ok: true,
      order_status: "preparing",
    });
    const patches: Array<{ id: string; patch: { order_status?: string } }> = [];
    const res = await runOwnerStoreOrderPatch(
      "store-1",
      "order-1",
      { order_status: "preparing" },
      "en",
      {
        onPatchOrderRow: (id, patch) => patches.push({ id, patch }),
      }
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.order_status).toBe("preparing");
    expect(patches).toHaveLength(1);
    expect(patches[0]?.patch.order_status).toBe("preparing");
  });

  it("reconciles from detail on invalid_transition", async () => {
    vi.mocked(patchOwnerStoreOrderStatus).mockResolvedValue({
      ok: false,
      error: "invalid_transition",
    });
    vi.mocked(fetchOwnerStoreOrderDetailDeduped).mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      order: {
        id: "order-1",
        order_no: "SO1",
        buyer_user_id: "u1",
        order_status: "preparing",
        fulfillment_type: "local_delivery",
        payment_status: "paid",
        payment_amount: 100,
        total_amount: 100,
        created_at: "2026-06-01T10:00:00.000Z",
        updated_at: "2026-06-01T12:00:00.000Z",
      },
      delivery: null,
      review: null,
    });
    const patches: Array<{ order_status?: string }> = [];
    const res = await runOwnerStoreOrderPatch(
      "store-1",
      "order-1",
      { order_status: "preparing" },
      "en",
      {
        onPatchOrderRow: (_id, patch) => patches.push(patch),
      }
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("invalid_transition");
      expect(res.displayMessage).toContain("updated");
    }
    expect(patches[0]?.order_status).toBe("preparing");
  });
});
