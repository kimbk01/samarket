import { describe, expect, it } from "vitest";
import { createStoreCouponCampaignAdmin } from "@/lib/stores/store-coupon-campaign-writer";

const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const BASE = {
  storeId: STORE,
  title: "QA-UI6-PLATFORM",
  discountType: "fixed_amount" as const,
  discountValue: 100,
  startAt: "2026-08-26T00:00:00.000Z",
  endAt: "2026-09-26T00:00:00.000Z",
  isActive: true,
};

function makeSb(inserts: unknown[]) {
  return {
    from(table: string) {
      if (table === "stores") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: STORE, approval_status: "approved" },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        insert(payload: unknown) {
          inserts.push(payload);
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: "camp-admin-1",
                  store_id: STORE,
                  title: BASE.title,
                  discount_type: "fixed_amount",
                  discount_value: 100,
                  min_order_amount: null,
                  terms_copy: null,
                  start_at: BASE.startAt,
                  end_at: BASE.endAt,
                  is_active: true,
                  created_by_user_id: "admin",
                  updated_by_user_id: "admin",
                  created_at: BASE.startAt,
                  updated_at: BASE.startAt,
                },
                error: null,
              }),
            }),
          };
        },
      };
    },
  };
}

describe("CUT UI-6 Admin coupon create writer", () => {
  it("PLATFORM_FUNDED insert writes funding_mode and null share", async () => {
    const inserts: unknown[] = [];
    const r = await createStoreCouponCampaignAdmin(
      makeSb(inserts) as never,
      { ...BASE, fundingMode: "PLATFORM_FUNDED" },
      "admin"
    );
    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.funding_mode).toBe("PLATFORM_FUNDED");
    expect(row.store_funded_amount).toBeNull();
    expect(row.lifecycle_state).toBe("active");
    expect(row.spend_budget_php).toBeNull();
  });

  it("SHARED_FUNDED insert writes store share", async () => {
    const inserts: unknown[] = [];
    const r = await createStoreCouponCampaignAdmin(
      makeSb(inserts) as never,
      { ...BASE, title: "QA-UI6-SHARED", fundingMode: "SHARED_FUNDED", storeFundedAmount: 60 },
      "admin"
    );
    expect(r.ok).toBe(true);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.funding_mode).toBe("SHARED_FUNDED");
    expect(row.store_funded_amount).toBe(60);
  });

  it("STORE_FUNDED does not insert", async () => {
    const inserts: unknown[] = [];
    const r = await createStoreCouponCampaignAdmin(
      makeSb(inserts) as never,
      { ...BASE, fundingMode: "STORE_FUNDED" },
      "admin"
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("admin_funding_forbidden");
    expect(inserts).toHaveLength(0);
  });
});
