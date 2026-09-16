import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/admin-membership", () => ({
  hasActiveAdminMembershipOrLegacyRole: vi.fn(),
}));

import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
import { resolveStoreOrderability } from "@/lib/stores/store-orderability-policy";

const adminFlag = vi.mocked(hasActiveAdminMembershipOrLegacyRole);

function profilesSb(role: string | null) {
  return {
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: role == null ? null : { role }, error: null }),
          }),
        }),
      };
    },
  } as never;
}

describe("resolveStoreOrderability — existing own-store policy matrix", () => {
  beforeEach(() => {
    adminFlag.mockReset();
  });

  it("CUSTOMER (non-owner): own-store rule irrelevant → can_order_store true", async () => {
    const r = await resolveStoreOrderability(profilesSb("user"), "customer-1", "owner-1");
    expect(r.can_order_store).toBe(true);
    expect(r.viewer_is_owner).toBe(false);
    expect(adminFlag).not.toHaveBeenCalled();
  });

  it("OWNER + OTHER STORE: treated as non-owner for that store → can_order_store true", async () => {
    const r = await resolveStoreOrderability(profilesSb("user"), "owner-1", "other-owner");
    expect(r.can_order_store).toBe(true);
    expect(r.viewer_is_owner).toBe(false);
    expect(adminFlag).not.toHaveBeenCalled();
  });

  it("NON-ADMIN OWNER + OWN STORE → can_order_store false", async () => {
    adminFlag.mockResolvedValue(false);
    const r = await resolveStoreOrderability(profilesSb("user"), "owner-1", "owner-1");
    expect(r).toMatchObject({
      viewer_is_owner: true,
      viewer_is_admin: false,
      can_order_store: false,
    });
    expect(adminFlag).toHaveBeenCalled();
  });

  it("ADMIN + OWN STORE → exemption preserved → can_order_store true", async () => {
    adminFlag.mockResolvedValue(true);
    const r = await resolveStoreOrderability(profilesSb("admin"), "owner-1", "owner-1");
    expect(r).toMatchObject({
      viewer_is_owner: true,
      viewer_is_admin: true,
      can_order_store: true,
    });
  });
});
