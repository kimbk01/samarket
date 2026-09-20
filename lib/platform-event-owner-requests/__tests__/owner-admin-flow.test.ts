import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertOwnerActionAllowed,
  canAdminTransitionEventPromoRequest,
  canOwnerTransitionEventPromoRequest,
  isOwnerEditableEventPromoRequest,
} from "@/lib/platform-event-owner-requests/lifecycle";
import { adminApproveOwnerEventPromoRequest } from "@/lib/platform-event-owner-requests/admin-review";
import {
  createOwnerEventPromoDraft,
  submitOwnerEventPromoRequest,
  updateOwnerEventPromoDraft,
} from "@/lib/platform-event-owner-requests/owner-writer";

vi.mock("@/lib/audit/append-audit-log", () => ({
  appendAuditLog: vi.fn(async () => undefined),
}));

const getStoreIfOwner = vi.fn();
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: (...args: unknown[]) => getStoreIfOwner(...args),
}));

type Row = Record<string, unknown>;

function makeMemorySb() {
  const tables: Record<string, Row[]> = {
    platform_event_owner_requests: [],
    platform_events: [],
    stores: [
      { id: "store-a", owner_user_id: "owner-a", approval_status: "approved", owner_can_edit_store_identity: true },
      { id: "store-b", owner_user_id: "owner-b", approval_status: "approved", owner_can_edit_store_identity: true },
    ],
  };
  let seq = 1;
  const nextId = () => `id-${seq++}`;

  function from(table: string) {
    const rows = () => tables[table] ?? (tables[table] = []);
    const api: Record<string, unknown> = {};
    const filters: Array<(r: Row) => boolean> = [];
    let pendingInsert: Row | null = null;
    let pendingUpdate: Row | null = null;
    let mode: "select" | "insert" | "update" = "select";

    const matched = () => rows().filter((r) => filters.every((f) => f(r)));

    api.select = () => api;
    api.insert = (payload: Row | Row[]) => {
      mode = "insert";
      const list = Array.isArray(payload) ? payload : [payload];
      for (const p of list) {
        const withId = { id: nextId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...p };
        rows().push(withId);
        pendingInsert = withId;
      }
      return api;
    };
    api.update = (payload: Row) => {
      mode = "update";
      pendingUpdate = payload;
      return api;
    };
    api.eq = (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      if (mode === "update" && pendingUpdate) {
        for (const r of matched()) Object.assign(r, pendingUpdate);
      }
      return api;
    };
    api.order = () => api;
    api.maybeSingle = async () => ({ data: matched()[0] ?? null, error: null });
    api.single = async () => {
      if (mode === "insert") return { data: pendingInsert, error: null };
      const out = matched()[0];
      return { data: out ?? null, error: out ? null : { message: "not_found" } };
    };
    Object.assign(api, {
      then(onFulfilled?: (v: unknown) => unknown) {
        const result =
          mode === "update" ? { error: null } : { data: matched(), error: null };
        return Promise.resolve(onFulfilled ? onFulfilled(result) : result);
      },
    });
    return api;
  }

  return {
    from,
    _tables: tables,
    reset() {
      tables.platform_event_owner_requests = [];
      tables.platform_events = [];
      seq = 1;
    },
  };
}

describe("Owner → Admin Event promo lifecycle", () => {
  const sb = makeMemorySb();

  beforeEach(() => {
    sb.reset();
    getStoreIfOwner.mockReset();
    getStoreIfOwner.mockImplementation(
      async (_sb: unknown, userId: string, storeId: string) => {
        const store = sb._tables.stores.find((s) => s.id === storeId);
        if (!store) return { ok: false, status: 404, error: "store_not_found" };
        if (store.owner_user_id !== userId) {
          return { ok: false, status: 403, error: "forbidden" };
        }
        return {
          ok: true,
          store: {
            id: store.id,
            owner_user_id: store.owner_user_id,
            approval_status: store.approval_status,
            owner_can_edit_store_identity: true,
          },
        };
      }
    );
  });

  it("SECURITY A: Owner A → Store A request PASS", async () => {
    const created = await createOwnerEventPromoDraft(sb as never, {
      ownerUserId: "owner-a",
      storeId: "store-a",
      title: "Promo A",
    });
    expect(created.ok).toBe(true);
  });

  it("SECURITY B: Owner A → Store B request DENIED", async () => {
    const created = await createOwnerEventPromoDraft(sb as never, {
      ownerUserId: "owner-a",
      storeId: "store-b",
    });
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error).toBe("forbidden");
  });

  it("SECURITY C: non-owner create DENIED", async () => {
    const created = await createOwnerEventPromoDraft(sb as never, {
      ownerUserId: "stranger",
      storeId: "store-a",
    });
    expect(created.ok).toBe(false);
  });

  it("SECURITY D/E/F/G: Owner forbidden live/distribution/push/audience actions", () => {
    expect(assertOwnerActionAllowed("edit_live_event")).toEqual({
      ok: false,
      error: "owner_forbidden",
    });
    expect(assertOwnerActionAllowed("send_push")).toEqual({
      ok: false,
      error: "owner_forbidden",
    });
    expect(assertOwnerActionAllowed("save_distribution")).toEqual({
      ok: false,
      error: "owner_forbidden",
    });
    expect(assertOwnerActionAllowed("set_global_audience")).toEqual({
      ok: false,
      error: "owner_forbidden",
    });
    expect(isOwnerEditableEventPromoRequest("approved")).toBe(false);
    expect(isOwnerEditableEventPromoRequest("submitted")).toBe(false);
  });

  it("FUNCTIONAL 1–2: draft/submit create zero public Events", async () => {
    const created = await createOwnerEventPromoDraft(sb as never, {
      ownerUserId: "owner-a",
      storeId: "store-a",
      title: "Draft promo",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(sb._tables.platform_events).toHaveLength(0);

    const submitted = await submitOwnerEventPromoRequest(sb as never, {
      ownerUserId: "owner-a",
      requestId: created.request.id,
    });
    expect(submitted.ok).toBe(true);
    expect(sb._tables.platform_events).toHaveLength(0);
  });

  it("FUNCTIONAL 3–5: reject then approve → Event draft linked; Push dispatch 0", async () => {
    const created = await createOwnerEventPromoDraft(sb as never, {
      ownerUserId: "owner-a",
      storeId: "store-a",
      title: "Review me",
    });
    if (!created.ok) throw new Error("create failed");
    await updateOwnerEventPromoDraft(sb as never, {
      ownerUserId: "owner-a",
      requestId: created.request.id,
      patch: {
        body: "Hello",
        requestedChannels: { popup: true, banner: false, push: true, bell: false },
      },
    });
    await submitOwnerEventPromoRequest(sb as never, {
      ownerUserId: "owner-a",
      requestId: created.request.id,
    });

    // Force status to under_review path for reject
    const row = sb._tables.platform_event_owner_requests[0];
    row.request_status = "under_review";

    const { adminActOnOwnerEventPromoRequest } = await import(
      "@/lib/platform-event-owner-requests/admin-review"
    );
    const rejected = await adminActOnOwnerEventPromoRequest(sb as never, {
      adminUserId: "admin-1",
      requestId: created.request.id,
      action: "reject",
      reason: "Need clearer CTA",
    });
    expect(rejected.ok).toBe(true);
    if (rejected.ok && "request" in rejected) {
      expect(rejected.request.requestStatus).toBe("rejected");
      expect(rejected.request.rejectionReason).toBe("Need clearer CTA");
    }
    expect(sb._tables.platform_events).toHaveLength(0);

    // Resubmit path: revision_required → submitted → approve
    row.request_status = "revision_required";
    await submitOwnerEventPromoRequest(sb as never, {
      ownerUserId: "owner-a",
      requestId: created.request.id,
    });

    const approved = await adminApproveOwnerEventPromoRequest(sb as never, {
      adminUserId: "admin-1",
      requestId: created.request.id,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.eventStatus).toBe("draft");
    expect(approved.pushDispatchCount).toBe(0);
    expect(approved.distributionConfigured).toBe(false);
    expect(sb._tables.platform_events).toHaveLength(1);
    expect(sb._tables.platform_events[0].status).toBe("draft");
    expect(sb._tables.platform_events[0].source_owner_request_id).toBe(created.request.id);
    expect(sb._tables.platform_events[0].source_store_id).toBe("store-a");

    // Idempotent approve
    const again = await adminApproveOwnerEventPromoRequest(sb as never, {
      adminUserId: "admin-1",
      requestId: created.request.id,
    });
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.replay).toBe(true);
      expect(again.platformEventId).toBe(approved.platformEventId);
    }
    expect(sb._tables.platform_events).toHaveLength(1);
  });

  it("FUNCTIONAL 6–9: requested Push does not imply dispatch; Admin Distribution still separate", async () => {
    expect(canOwnerTransitionEventPromoRequest("draft", "submitted")).toBe(true);
    expect(canAdminTransitionEventPromoRequest("submitted", "approved")).toBe(true);
    // Approve with push requested still draft event only
    const created = await createOwnerEventPromoDraft(sb as never, {
      ownerUserId: "owner-a",
      storeId: "store-a",
      title: "Push please",
    });
    if (!created.ok) throw new Error("create failed");
    await updateOwnerEventPromoDraft(sb as never, {
      ownerUserId: "owner-a",
      requestId: created.request.id,
      patch: { requestedChannels: { push: true, popup: true, banner: false, bell: false } },
    });
    await submitOwnerEventPromoRequest(sb as never, {
      ownerUserId: "owner-a",
      requestId: created.request.id,
    });
    const approved = await adminApproveOwnerEventPromoRequest(sb as never, {
      adminUserId: "admin-1",
      requestId: created.request.id,
    });
    expect(approved.ok).toBe(true);
    if (approved.ok) {
      expect(approved.pushDispatchCount).toBe(0);
      expect(approved.request.requestedChannels.push).toBe(true);
    }
  });

  it("SECURITY H/I: Admin approve/reject PASS; reject requires reason", async () => {
    const created = await createOwnerEventPromoDraft(sb as never, {
      ownerUserId: "owner-a",
      storeId: "store-a",
      title: "Need reason",
    });
    if (!created.ok) throw new Error("create failed");
    await submitOwnerEventPromoRequest(sb as never, {
      ownerUserId: "owner-a",
      requestId: created.request.id,
    });
    const { adminActOnOwnerEventPromoRequest } = await import(
      "@/lib/platform-event-owner-requests/admin-review"
    );
    const noReason = await adminActOnOwnerEventPromoRequest(sb as never, {
      adminUserId: "admin-1",
      requestId: created.request.id,
      action: "reject",
      reason: "",
    });
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.error).toBe("rejection_reason_required");
  });
});
