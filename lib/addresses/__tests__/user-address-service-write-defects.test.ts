import { beforeEach, describe, expect, it, vi } from "vitest";

const lguMock = vi.hoisted(() => ({ resolve: vi.fn<(...args: unknown[]) => string | null>(() => null) }));

vi.mock("@/lib/delivery/service-area/resolve-member-canonical-lgu", () => ({
  resolveCanonicalLguIdForAddressWrite: (...args: unknown[]) => lguMock.resolve(...args),
}));

vi.mock("@/lib/addresses/resolve-user-address-shop-write", () => ({
  resolveUserAddressWritePayloadForShop: async (_sb: unknown, _uid: string, p: unknown) => p,
  shouldApplyShopSnapshotToUpdatePatch: () => false,
  shopResolvedToAddressPatch: () => ({}),
}));

import { updateUserAddress } from "@/lib/addresses/user-address-service";
import { validatePlacesAddressPayload } from "@/lib/addresses/address-api-validation";

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string; details?: string };

/** Minimal in-memory PostgREST chain: select/update + eq/order/limit/single/maybeSingle. */
function fakeSupabase(rows: Row[], opts?: { updateError?: DbError }) {
  const updates: Row[] = [];
  const from = () => {
    let op: "select" | "update" = "select";
    let patch: Row = {};
    const filters: [string, unknown][] = [];
    const match = () => rows.filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = () => {
      if (op === "update") {
        if (opts?.updateError) return { data: null, error: opts.updateError };
        updates.push(patch);
        for (const r of match()) Object.assign(r, patch);
        return { data: null, error: null };
      }
      return { data: match(), error: null };
    };
    const one = () => {
      const res = run();
      const list = (res.data as Row[] | null) ?? [];
      return { data: list[0] ?? null, error: res.error ?? (list[0] ? null : { message: "no rows" }) };
    };
    const q = {
      select: () => q,
      update: (p: Row) => {
        op = "update";
        patch = p;
        return q;
      },
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return q;
      },
      order: () => q,
      limit: () => q,
      single: async () => one(),
      maybeSingle: async () => ({ data: one().data, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  return { sb: { from } as never, updates };
}

function row(partial: Row): Row {
  return {
    id: "a1",
    user_id: "u1",
    label_type: "home",
    linked_store_id: null,
    nickname: "Home",
    province: "Metro Manila",
    city_municipality: "Quezon City",
    latitude: 14.65,
    longitude: 121.03,
    place_id: null,
    formatted_address: "Diliman, Quezon City",
    detail_address: "Unit 1",
    canonical_lgu_id: "lgu-qc",
    use_for_life: true,
    use_for_trade: true,
    use_for_delivery: true,
    is_default_master: false,
    is_default_life: false,
    is_default_trade: false,
    is_default_delivery: false,
    is_active: true,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

beforeEach(() => {
  lguMock.resolve.mockReset();
  lguMock.resolve.mockReturnValue(null);
});

describe("DATA-001 updateUserAddress ignores soft-deleted rows", () => {
  it("PATCH on an inactive row → address_not_found, no writes", async () => {
    const { sb, updates } = fakeSupabase([row({ id: "a1", is_active: false })]);
    await expect(updateUserAddress(sb, "u1", "a1", { isDefaultMaster: true })).rejects.toThrow("address_not_found");
    expect(updates).toHaveLength(0);
  });
});

describe("DATA-005 pin-only edit keeps canonical_lgu_id on failed resolve", () => {
  it("lat/lng-only patch with unresolvable LGU does not clear existing id", async () => {
    const rows = [row({ id: "a1", is_default_master: true })];
    const { sb, updates } = fakeSupabase(rows);
    await updateUserAddress(sb, "u1", "a1", { latitude: 14.66, longitude: 121.04 });
    expect(updates.some((u) => "canonical_lgu_id" in u)).toBe(false);
    expect(rows[0].canonical_lgu_id).toBe("lgu-qc");
    expect(rows[0].latitude).toBe(14.66);
  });

  it("resolvable LGU on pin edit is persisted", async () => {
    lguMock.resolve.mockReturnValue("lgu-new");
    const rows = [row({ id: "a1", is_default_master: true })];
    const { sb } = fakeSupabase(rows);
    await updateUserAddress(sb, "u1", "a1", { latitude: 14.66, longitude: 121.04 });
    expect(rows[0].canonical_lgu_id).toBe("lgu-new");
  });

  it("city change with unresolvable LGU clears the stale id", async () => {
    const rows = [row({ id: "a1", is_default_master: true })];
    const { sb } = fakeSupabase(rows);
    await updateUserAddress(sb, "u1", "a1", { cityMunicipality: "Unknown Town" });
    expect(rows[0].canonical_lgu_id).toBeNull();
  });
});

describe("DATA-010 linked-store unique index maps to shop_address_duplicate", () => {
  it("23505 on user_addresses_user_active_linked_store_unique is not a default conflict", async () => {
    const { sb } = fakeSupabase([row({ id: "a1" })], {
      updateError: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "user_addresses_user_active_linked_store_unique"',
      },
    });
    await expect(updateUserAddress(sb, "u1", "a1", { nickname: "Shop" })).rejects.toThrow("shop_address_duplicate");
  });

  it("index name only in details also maps to shop_address_duplicate", async () => {
    const { sb } = fakeSupabase([row({ id: "a1" })], {
      updateError: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "index user_addresses_user_active_linked_store_unique",
      },
    });
    await expect(updateUserAddress(sb, "u1", "a1", { nickname: "Shop" })).rejects.toThrow("shop_address_duplicate");
  });

  it("other 23505 stays address_default_conflict", async () => {
    const { sb } = fakeSupabase([row({ id: "a1" })], {
      updateError: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "user_addresses_one_master"',
      },
    });
    await expect(updateUserAddress(sb, "u1", "a1", { nickname: "Shop" })).rejects.toThrow("address_default_conflict");
  });
});

describe("DATA-006 coordinate validation", () => {
  const base = { formattedAddress: "Diliman, Quezon City", detailAddress: "Unit 1" };
  it("rejects (0,0)", () => {
    expect(validatePlacesAddressPayload({ ...base, latitude: 0, longitude: 0 })).toBe("coordinates_invalid");
  });
  it("rejects out-of-range lat/lng", () => {
    expect(validatePlacesAddressPayload({ ...base, latitude: 91, longitude: 121 })).toBe("coordinates_invalid");
    expect(validatePlacesAddressPayload({ ...base, latitude: 14, longitude: -181 })).toBe("coordinates_invalid");
  });
  it("accepts a real PH pin and single-zero axis", () => {
    expect(validatePlacesAddressPayload({ ...base, latitude: 14.65, longitude: 121.03 })).toBeNull();
    expect(validatePlacesAddressPayload({ ...base, latitude: 0, longitude: 121.03 })).toBeNull();
  });
});
