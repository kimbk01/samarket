/**
 * 3-C IA-04 (=ADS-20) · IA-05 — owner coupon PATCH: transition table + CAS + error checks, idempotent reissue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const OWNER = "owner-1";
const STORE = "store-1";
const validateActiveSession = vi.fn();
const bump = vi.fn();

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => OWNER }));
vi.mock("@/lib/auth/server-guards", () => ({
  validateActiveSession: (...a: unknown[]) => validateActiveSession(...a),
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: (...a: unknown[]) => bump(...a),
}));

type Op = { table: string; kind: string; payload?: unknown; filters: Array<[string, string, unknown]> };

type World = {
  campaign: Record<string, unknown> | null;
  approval?: string;
  /** result of the CAS update chain */
  updateResult?: { data: unknown; error: { message: string } | null };
  /** existing reissue row for (store, source, key) lookups, per call order */
  reissueLookups?: Array<Record<string, unknown> | null>;
  insertResult?: { data: unknown; error: { message: string; code?: string } | null };
  ops: Op[];
};

let world: World;

function builder(table: string) {
  const op: Op = { table, kind: "select", filters: [] };
  world.ops.push(op);
  const b: Record<string, unknown> = {};
  const resolveTerminal = () => {
    if (table === "stores") {
      return { data: { id: STORE, owner_user_id: OWNER, approval_status: world.approval ?? "approved" }, error: null };
    }
    if (table === "coupon_audit_events") return { data: null, error: null };
    if (op.kind === "update") return world.updateResult ?? { data: [{ id: "c1" }], error: null };
    if (op.kind === "insert") return world.insertResult ?? { data: { id: "new-1", lifecycle_state: "active" }, error: null };
    if (op.filters.some(([, k]) => k === "client_request_id")) {
      const next = world.reissueLookups?.shift() ?? null;
      return { data: next, error: null };
    }
    return { data: world.campaign, error: null };
  };
  Object.assign(b, {
    select: () => b,
    update: (payload: unknown) => {
      op.kind = "update";
      op.payload = payload;
      return b;
    },
    insert: (payload: unknown) => {
      op.kind = "insert";
      op.payload = payload;
      return b;
    },
    eq: (k: string, v: unknown) => {
      op.filters.push(["eq", k, v]);
      return b;
    },
    in: (k: string, v: unknown) => {
      op.filters.push(["in", k, v]);
      return b;
    },
    or: (expr: string) => {
      op.filters.push(["or", expr, null]);
      return b;
    },
    maybeSingle: async () => resolveTerminal(),
    single: async () => resolveTerminal(),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(resolveTerminal()).then(res, rej),
  });
  return b;
}

vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({ from: (t: string) => builder(t) }),
}));

import { PATCH } from "@/app/api/me/store-coupons/campaigns/route";

async function patch(body: Record<string, unknown>) {
  const res = await PATCH(
    new NextRequest("https://x.test/api/me/store-coupons/campaigns", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function campaign(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    store_id: STORE,
    lifecycle_state: "active",
    is_active: true,
    paused_by: null,
    funding_mode: "STORE_FUNDED",
    issuer_role: "owner",
    title: "T",
    discount_type: "fixed_amount",
    discount_value: 50,
    ...over,
  };
}

const updates = () => world.ops.filter((o) => o.table === "store_coupon_campaigns" && o.kind === "update");
const inserts = () => world.ops.filter((o) => o.table === "store_coupon_campaigns" && o.kind === "insert");
const audits = () => world.ops.filter((o) => o.table === "coupon_audit_events" && o.kind === "insert");

beforeEach(() => {
  vi.clearAllMocks();
  validateActiveSession.mockResolvedValue({ ok: true });
  world = { campaign: campaign(), ops: [] };
});

describe("IA-04 owner coupon transitions", () => {
  it("pause active → CAS update with from-state + is_active guard, paused_by owner, is_active false, audit", async () => {
    const { status, json } = await patch({ id: "c1", action: "pause" });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, lifecycle_state: "paused" });
    const [u] = updates();
    expect(u.payload).toMatchObject({ lifecycle_state: "paused", is_active: false, paused_by: "owner" });
    expect(u.filters).toContainEqual(["in", "lifecycle_state", ["active", "scheduled"]]);
    expect(u.filters).toContainEqual(["eq", "is_active", true]);
    expect(audits()[0]?.payload).toMatchObject({ action: "owner_pause", campaign_id: "c1" });
    expect(bump).toHaveBeenCalledWith("owner_coupon.pause");
  });

  it.each(["ended", "revoked"])("%s pause → 409 invalid_transition, no write", async (st) => {
    world.campaign = campaign({ lifecycle_state: st, is_active: false });
    const { status, json } = await patch({ id: "c1", action: "pause" });
    expect(status).toBe(409);
    expect(json.error).toBe("invalid_transition");
    expect(updates()).toHaveLength(0);
  });

  it.each(["ended", "revoked"])("%s resume → 409 (no revival)", async (st) => {
    world.campaign = campaign({ lifecycle_state: st, is_active: false });
    const { status } = await patch({ id: "c1", action: "resume" });
    expect(status).toBe(409);
    expect(updates()).toHaveLength(0);
  });

  it("admin-paused resume → 403 admin_paused_resume_forbidden", async () => {
    world.campaign = campaign({ lifecycle_state: "paused", is_active: false, paused_by: "admin" });
    const { status, json } = await patch({ id: "c1", action: "resume" });
    expect(status).toBe(403);
    expect(json.error).toBe("admin_paused_resume_forbidden");
    expect(updates()).toHaveLength(0);
  });

  it("legacy paused (paused_by NULL) resume → ok, CAS excludes admin-paused", async () => {
    world.campaign = campaign({ lifecycle_state: "paused", is_active: false, paused_by: null });
    const { status } = await patch({ id: "c1", action: "resume" });
    expect(status).toBe(200);
    const [u] = updates();
    expect(u.payload).toMatchObject({ lifecycle_state: "active", is_active: true, paused_by: null });
    expect(u.filters).toContainEqual(["or", "paused_by.is.null,paused_by.eq.owner", null]);
  });

  it("CAS 0 rows (state changed meanwhile) → 409, no audit", async () => {
    world.updateResult = { data: [], error: null };
    const { status, json } = await patch({ id: "c1", action: "end" });
    expect(status).toBe(409);
    expect(json.error).toBe("invalid_transition");
    expect(audits()).toHaveLength(0);
  });

  it("DB error on update → 500 db_error (never ok:true)", async () => {
    world.updateResult = { data: null, error: { message: "boom" } };
    const { status, json } = await patch({ id: "c1", action: "end" });
    expect(status).toBe(500);
    expect(json).toMatchObject({ ok: false, error: "db_error" });
  });

  it("inactive session → session response, no write", async () => {
    validateActiveSession.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false }), { status: 401 }),
    });
    const { status } = await patch({ id: "c1", action: "pause" });
    expect(status).toBe(401);
    expect(world.ops).toHaveLength(0);
  });

  it("suspended store → 403 gate (1-B), no write", async () => {
    world.approval = "suspended";
    const { status } = await patch({ id: "c1", action: "pause" });
    expect(status).toBe(403);
    expect(updates()).toHaveLength(0);
  });
});

describe("IA-05 idempotent reissue", () => {
  it("missing clientRequestId → 400, no insert", async () => {
    const { status, json } = await patch({ id: "c1", action: "reissue" });
    expect(status).toBe(400);
    expect(json.error).toBe("missing_client_request_id");
    expect(inserts()).toHaveLength(0);
  });

  it("first call inserts with source + key and max_uses 1; same key again returns the existing row (1 row)", async () => {
    world.reissueLookups = [null];
    const first = await patch({ id: "c1", action: "reissue", clientRequestId: "reissue-key-0001" });
    expect(first.status).toBe(200);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].payload).toMatchObject({
      source_campaign_id: "c1",
      client_request_id: "reissue-key-0001",
      max_uses_per_user: 1,
      lifecycle_state: "active",
      is_active: true,
    });

    world.reissueLookups = [{ id: "new-1", lifecycle_state: "active" }];
    const second = await patch({ id: "c1", action: "reissue", clientRequestId: "reissue-key-0001" });
    expect(second.status).toBe(200);
    expect(second.json).toMatchObject({ ok: true, idempotent: true, campaign: { id: "new-1" } });
    expect(inserts()).toHaveLength(1);
  });

  it.each(["revoked", "rejected"])("admin-%s source → 409 reissue_source_blocked, no insert", async (state) => {
    world.campaign = { ...world.campaign, lifecycle_state: state };
    world.reissueLookups = [null];
    const { status, json } = await patch({ id: "c1", action: "reissue", clientRequestId: "reissue-key-0009" });
    expect(status).toBe(409);
    expect(json.error).toBe("reissue_source_blocked");
    expect(inserts()).toHaveLength(0);
  });

  it("concurrent duplicate (23505) → returns the winner row as idempotent", async () => {
    world.reissueLookups = [null, { id: "winner", lifecycle_state: "active" }];
    world.insertResult = { data: null, error: { message: "duplicate", code: "23505" } };
    const { status, json } = await patch({ id: "c1", action: "reissue", clientRequestId: "reissue-key-0002" });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, idempotent: true, campaign: { id: "winner" } });
  });

  it("other insert error → 500", async () => {
    world.reissueLookups = [null];
    world.insertResult = { data: null, error: { message: "x" } };
    const { status } = await patch({ id: "c1", action: "reissue", clientRequestId: "reissue-key-0003" });
    expect(status).toBe(500);
  });
});
