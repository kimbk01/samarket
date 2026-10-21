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

import {
  createUserAddress,
  setUserAddressAsDefault,
  updateUserAddress,
} from "@/lib/addresses/user-address-service";
import { validatePlacesAddressPayload } from "@/lib/addresses/address-api-validation";

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string; details?: string };

/** Minimal in-memory PostgREST chain: select/update + eq/order/limit/single/maybeSingle. */
function fakeSupabase(rows: Row[], opts?: { updateError?: DbError; rpcResult?: Row }) {
  const updates: Row[] = [];
  const inserts: Row[] = [];
  const rpcCalls: [string, Row][] = [];
  /** `user_address_set_master` 시뮬레이션 — 해제·지정이 한 호출에서 일어난다 */
  const rpc = async (name: string, args: Row) => {
    rpcCalls.push([name, args]);
    if (opts?.rpcResult) return { data: opts.rpcResult, error: null };
    const target = rows.find((r) => r.id === args.p_address_id && r.user_id === args.p_user_id && r.is_active === true);
    if (!target) return { data: { ok: false, error: "address_not_found" }, error: null };
    for (const r of rows) {
      if (r.user_id === args.p_user_id && r.is_active === true) r.is_default_master = r.id === target.id;
    }
    return { data: { ok: true }, error: null };
  };
  const from = () => {
    let op: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    const filters: [string, unknown][] = [];
    const match = () => rows.filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = () => {
      if (op === "insert") {
        inserts.push(patch);
        const created = { ...patch, id: `new-${inserts.length}` };
        rows.push(created);
        return { data: [created], error: null };
      }
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
      insert: (p: Row) => {
        op = "insert";
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
  return { sb: { from, rpc } as never, updates, inserts, rpcCalls };
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

function validPayload(): import("@/lib/addresses/user-address-types").UserAddressWritePayload {
  return {
    labelType: "home",
    province: "Metro Manila",
    cityMunicipality: "Quezon City",
    latitude: 14.65,
    longitude: 121.03,
    formattedAddress: "Diliman, Quezon City",
    detailAddress: "Unit 2",
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
  };
}

describe("ADDR-DATA-004: 대표 지정은 user_address_set_master 한 번으로", () => {
  beforeEach(() => lguMock.resolve.mockReset());

  it("updateUserAddress(isDefaultMaster) → RPC 1회, 별도 해제 UPDATE 없음, 대표 1건", async () => {
    const rows = [row({ id: "a1", is_default_master: true }), row({ id: "a2", nickname: "Office" })];
    const { sb, updates, rpcCalls } = fakeSupabase(rows);
    await updateUserAddress(sb, "u1", "a2", { isDefaultMaster: true });
    expect(rpcCalls).toEqual([["user_address_set_master", { p_user_id: "u1", p_address_id: "a2" }]]);
    expect(updates.some((u) => u.is_default_master === false)).toBe(false);
    expect(rows.filter((r) => r.is_default_master).map((r) => r.id)).toEqual(["a2"]);
  });

  it("setUserAddressAsDefault: RPC 가 address_not_found 면 그대로 전달", async () => {
    const rows = [row({ id: "a1" })];
    const { sb } = fakeSupabase(rows, { rpcResult: { ok: false, error: "address_not_found" } });
    await expect(setUserAddressAsDefault(sb, "u1", "a1")).rejects.toThrow("address_not_found");
  });
});

describe("ADDR-DATA-003: client_request_id 멱등 생성", () => {
  beforeEach(() => lguMock.resolve.mockReset());

  it("같은 client_request_id 의 활성 주소가 있으면 새로 만들지 않고 반환", async () => {
    const rows = [row({ id: "a1", client_request_id: "req-1", is_default_master: true })];
    const { sb, inserts } = fakeSupabase(rows);
    const payload = { ...validPayload(), nickname: "Home 2" };
    const out = await createUserAddress(sb, "u1", payload, { clientRequestId: "req-1" });
    expect(out.id).toBe("a1");
    expect(inserts).toHaveLength(0);
  });

  it("재요청 — 앞선 요청이 대표 지정 전에 실패했으면 대표 지정·새 입력을 반영", async () => {
    const rows = [row({ id: "a1", client_request_id: "req-1", is_default_master: false, detail_address: "Unit 1" })];
    const { sb, inserts } = fakeSupabase(rows);
    const out = await createUserAddress(
      sb,
      "u1",
      { ...validPayload(), detailAddress: "Unit 9", isDefaultMaster: true },
      { clientRequestId: "req-1" },
    );
    expect(inserts).toHaveLength(0);
    expect(out.id).toBe("a1");
    expect(out.isDefaultMaster).toBe(true);
    expect(rows[0]!.detail_address).toBe("Unit 9");
  });

  it("새 요청은 client_request_id 를 함께 저장", async () => {
    const rows = [row({ id: "a1", is_default_master: true })];
    const { sb, inserts } = fakeSupabase(rows);
    await createUserAddress(sb, "u1", { ...validPayload(), nickname: "Home 2" }, { clientRequestId: "req-2" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.client_request_id).toBe("req-2");
  });
});

