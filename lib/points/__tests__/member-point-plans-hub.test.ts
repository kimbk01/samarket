import { describe, expect, it, vi } from "vitest";
import { updateMemberPointPlan } from "@/lib/points/member-point-plans";

function makeSb(existing: Record<string, unknown>, updated: Record<string, unknown>) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: updated, error: null }),
      }),
    }),
  });
  return {
    from: vi.fn((table: string) => {
      if (table !== "point_plans") throw new Error(table);
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
          }),
        }),
        update,
      };
    }),
    _update: update,
  };
}

describe("updateMemberPointPlan rate_version bump", () => {
  it("bumps rate_version when payment_amount changes", async () => {
    const existing = {
      id: "p1",
      name_ko: "1k",
      name_en: "1k",
      description_ko: "",
      description_en: "",
      payment_amount: 1000,
      point_amount: 1000,
      bonus_amount: 0,
      currency: "PHP",
      is_active: true,
      sort_order: 10,
      rate_version: 1,
    };
    const updated = { ...existing, payment_amount: 1200, rate_version: 2 };
    const sb = makeSb(existing, updated);
    const res = await updateMemberPointPlan(sb as never, "p1", { paymentAmount: 1200 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.plan.rateVersion).toBe(2);
    const patchArg = sb._update.mock.calls[0][0] as Record<string, unknown>;
    expect(patchArg.rate_version).toBe(2);
    expect(patchArg.payment_amount).toBe(1200);
  });

  it("does not bump rate_version when only name changes", async () => {
    const existing = {
      id: "p1",
      name_ko: "1k",
      name_en: "1k",
      description_ko: "",
      description_en: "",
      payment_amount: 1000,
      point_amount: 1000,
      bonus_amount: 0,
      currency: "PHP",
      is_active: true,
      sort_order: 10,
      rate_version: 3,
    };
    const updated = { ...existing, name_ko: "new" };
    const sb = makeSb(existing, updated);
    const res = await updateMemberPointPlan(sb as never, "p1", { nameKo: "new" });
    expect(res.ok).toBe(true);
    const patchArg = sb._update.mock.calls[0][0] as Record<string, unknown>;
    expect(patchArg.rate_version).toBeUndefined();
    expect(patchArg.name_ko).toBe("new");
  });
});
