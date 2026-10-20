/**
 * V3-03 (O-9) — popup campaign compare-and-set + owner request reject single RPC.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const appendAuditLog = vi.fn();
const loadPlatformPopupOwnerRequest = vi.fn();
const refundBusinessCashForRejectedDeliveryAd = vi.fn();

vi.mock("@/lib/audit/append-audit-log", () => ({
  appendAuditLog: (...a: unknown[]) => appendAuditLog(...a),
}));
vi.mock("@/lib/platform-popup/owner-request-loader", () => ({
  PLATFORM_POPUP_OWNER_REQUEST_TABLE: "platform_popup_owner_requests",
  loadPlatformPopupOwnerRequest: (...a: unknown[]) => loadPlatformPopupOwnerRequest(...a),
}));
vi.mock("@/lib/stores/advertising/canonical-business-cash-writer", () => ({
  refundBusinessCashForRejectedDeliveryAd: (...a: unknown[]) =>
    refundBusinessCashForRejectedDeliveryAd(...a),
}));

import { transitionPlatformPopupCampaign } from "@/lib/platform-popup/admin-transitions";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";
import {
  ADMIN_REJECT_POPUP_OWNER_REQUEST_RPC,
  adminActOnPlatformPopupOwnerRequest,
} from "@/lib/platform-popup/owner-request-approve";

type Call = { table: string; op: string; args: unknown[] };

/** Minimal chainable Supabase stub: each terminal resolves from `results[table:op]`. */
function makeSb(results: Record<string, unknown>, rpcResult?: unknown) {
  const calls: Call[] = [];
  const rpc = vi.fn().mockResolvedValue(rpcResult ?? { data: null, error: null });
  const from = (table: string) => {
    let op = "select";
    const chain: Record<string, unknown> = {};
    const record = (name: string) => (...args: unknown[]) => {
      if (name === "update" || name === "insert") op = name;
      calls.push({ table, op: name, args });
      return chain;
    };
    for (const m of ["select", "update", "insert", "eq", "is", "in"]) chain[m] = record(m);
    const resolve = () => Promise.resolve(results[`${table}:${op}`] ?? { data: null, error: null });
    chain.maybeSingle = resolve;
    chain.single = resolve;
    chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => resolve().then(ok, bad);
    return chain;
  };
  return { sb: { from, rpc } as never, calls, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("V3-03a transitionPlatformPopupCampaign compare-and-set", () => {
  it("filters UPDATE by previously read status + approval_status", async () => {
    const { sb, calls } = makeSb({
      "platform_popup_campaigns:select": {
        data: { id: "c1", status: "pending_review", approval_status: "pending_review" },
        error: null,
      },
      "platform_popup_campaigns:update": {
        data: { id: "c1", status: "rejected", approval_status: "rejected" },
        error: null,
      },
    });
    const res = await transitionPlatformPopupCampaign(sb, {
      campaignId: "c1",
      actorUserId: "a1",
      actorRole: "admin",
      nextStatus: "rejected",
      nextApproval: "rejected",
    });
    expect(res.ok).toBe(true);
    const updIdx = calls.findIndex((c) => c.op === "update");
    const eqs = calls.slice(updIdx).filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toEqual([
      ["id", "c1"],
      ["status", "pending_review"],
      ["approval_status", "pending_review"],
    ]);
  });

  it("0 rows updated → stale_state 409 and no audit", async () => {
    const { sb } = makeSb({
      "platform_popup_campaigns:select": {
        data: { id: "c1", status: "pending_review", approval_status: "pending_review" },
        error: null,
      },
      "platform_popup_campaigns:update": { data: null, error: null },
    });
    const res = await transitionPlatformPopupCampaign(sb, {
      campaignId: "c1",
      actorUserId: "a1",
      actorRole: "admin",
      nextStatus: "rejected",
      nextApproval: "rejected",
    });
    expect(res).toEqual({ ok: false, error: "stale_state", httpStatus: 409 });
    expect(appendAuditLog).not.toHaveBeenCalled();
  });

  it("UI message for stale_state is Korean", () => {
    expect(formatPlatformPopupAdminError("stale_state", "ko")).toContain("새로고침");
  });
});

const baseRequest = {
  id: "r1",
  requestStatus: "under_review",
  paymentStatus: "funded",
  adminCampaignId: null,
};

describe("V3-03b owner request reject — single RPC transaction", () => {
  it("calls admin_reject_platform_popup_owner_request only (no TS refund / table update)", async () => {
    loadPlatformPopupOwnerRequest.mockResolvedValue(baseRequest);
    const { sb, rpc, calls } = makeSb(
      {},
      { data: { ok: true, request_status: "rejected", payment_status: "refunded" }, error: null }
    );
    const res = await adminActOnPlatformPopupOwnerRequest(sb, {
      requestId: "r1",
      adminUserId: "a1",
      action: "reject",
      reason: " 규정 위반 ",
    });
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(ADMIN_REJECT_POPUP_OWNER_REQUEST_RPC, {
      p_request_id: "r1",
      p_reason: "규정 위반",
      p_actor: "a1",
    });
    expect(refundBusinessCashForRejectedDeliveryAd).not.toHaveBeenCalled();
    expect(calls.some((c) => c.op === "update")).toBe(false);
    expect(appendAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "platform_popup_owner_request.reject",
        after_json: expect.objectContaining({ payment_status: "refunded" }),
      })
    );
  });

  it.each([
    ["illegal_transition", 409],
    ["not_found", 404],
    ["refund_failed:not_secured", 400],
    ["forbidden", 500],
  ])("maps RPC error %s → %i", async (error, httpStatus) => {
    loadPlatformPopupOwnerRequest.mockResolvedValue(baseRequest);
    const { sb } = makeSb({}, { data: { ok: false, error }, error: null });
    const res = await adminActOnPlatformPopupOwnerRequest(sb, {
      requestId: "r1",
      adminUserId: "a1",
      action: "reject",
    });
    expect(res).toMatchObject({ ok: false, error, httpStatus });
    expect(appendAuditLog).not.toHaveBeenCalled();
  });

  it("RPC missing (PGRST202) → 503 without refund or status update (no 2-step fallback)", async () => {
    loadPlatformPopupOwnerRequest.mockResolvedValue(baseRequest);
    const { sb, calls } = makeSb(
      { "platform_popup_owner_requests:update": { data: null, error: null } },
      { data: null, error: { code: "PGRST202", message: "Could not find the function" } }
    );
    const res = await adminActOnPlatformPopupOwnerRequest(sb, {
      requestId: "r1",
      adminUserId: "a1",
      action: "reject",
    });
    expect(res).toMatchObject({ ok: false, httpStatus: 503 });
    expect(refundBusinessCashForRejectedDeliveryAd).not.toHaveBeenCalled();
    expect(calls.some((c) => c.op === "update" && c.table === "platform_popup_owner_requests")).toBe(false);
    expect(appendAuditLog).not.toHaveBeenCalled();
  });

  it("other RPC transport errors → 500 without fallback", async () => {
    loadPlatformPopupOwnerRequest.mockResolvedValue(baseRequest);
    const { sb } = makeSb({}, { data: null, error: { code: "57014", message: "timeout" } });
    const res = await adminActOnPlatformPopupOwnerRequest(sb, {
      requestId: "r1",
      adminUserId: "a1",
      action: "reject",
    });
    expect(res).toMatchObject({ ok: false, httpStatus: 500 });
    expect(refundBusinessCashForRejectedDeliveryAd).not.toHaveBeenCalled();
  });
});
