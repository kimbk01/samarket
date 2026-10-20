/**
 * V3-04 (O-9) — DEF-5 admin reject + refund / DEF-7 owner submit + debit in one DB transaction.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stores/advertising/delivery-ad-operations-lifecycle-fanout", () => ({
  safeFanOutDeliveryAdLifecycleAudit: vi.fn().mockResolvedValue(undefined),
}));

import {
  ADMIN_DELIVERY_AD_REJECT_WITH_REFUND_RPC,
  adminTransitionDeliveryAdCampaign,
} from "@/lib/stores/advertising/admin-delivery-ad-writer";
import {
  OWNER_SUBMIT_DELIVERY_AD_WITH_BC_RPC,
  ownerSubmitDeliveryAdWithBusinessCash,
} from "@/lib/stores/advertising/canonical-business-cash-writer";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

function makeSb(byName: Record<string, RpcResult>) {
  const rpc = vi.fn(async (name: string) => byName[name] ?? { data: null, error: null });
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "update", "eq", "is", "in"]) chain[m] = () => chain;
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "case-1" }], error: null }).then(ok);
  const from = vi.fn(() => chain);
  return { sb: { rpc, from } as never, rpc, from };
}

const MISSING = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };

const rejectInput = {
  adminUserId: "admin-1",
  productKind: "store_sponsored" as const,
  campaignId: "camp-1",
  action: "reject" as const,
  expectedLifecycle: "UNDER_REVIEW" as const,
  expectedUpdatedAt: "2026-10-20T00:00:00.000Z",
  reason: "정책 위반",
  ownerVisibleNotes: null,
};

beforeEach(() => vi.clearAllMocks());

describe("V3-04 DEF-5 admin reject — single RPC", () => {
  it("calls admin_delivery_ad_reject_with_refund only (no separate refund call)", async () => {
    const { sb, rpc } = makeSb({
      [ADMIN_DELIVERY_AD_REJECT_WITH_REFUND_RPC]: {
        data: { ok: true, campaign_id: "camp-1", from: "UNDER_REVIEW", to: "REJECTED", audit_id: "au-1", refunded: true },
        error: null,
      },
    });
    const res = await adminTransitionDeliveryAdCampaign(sb, rejectInput);
    expect(res).toMatchObject({ ok: true, to: "REJECTED", auditId: "au-1" });
    expect(res.ok && "refundWarning" in res).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(ADMIN_DELIVERY_AD_REJECT_WITH_REFUND_RPC, {
      p_admin_user_id: "admin-1",
      p_product_kind: "store_sponsored",
      p_campaign_id: "camp-1",
      p_expected_lifecycle: "UNDER_REVIEW",
      p_expected_updated_at: "2026-10-20T00:00:00.000Z",
      p_reason: "정책 위반",
      p_owner_visible_notes: "정책 위반",
    });
  });

  it("refund failure inside the transaction → reject_refund_failed (nothing committed)", async () => {
    const { sb } = makeSb({
      [ADMIN_DELIVERY_AD_REJECT_WITH_REFUND_RPC]: {
        data: { ok: false, error: "refund_failed", detail: "rpc_failed" },
        error: null,
      },
    });
    const res = await adminTransitionDeliveryAdCampaign(sb, rejectInput);
    expect(res).toEqual({ ok: false, error: "reject_refund_failed", detail: "rpc_failed" });
  });

  it("stale lifecycle from the wrapped transition is passed through", async () => {
    const { sb } = makeSb({
      [ADMIN_DELIVERY_AD_REJECT_WITH_REFUND_RPC]: {
        data: { ok: false, error: "stale_lifecycle" },
        error: null,
      },
    });
    const res = await adminTransitionDeliveryAdCampaign(sb, rejectInput);
    expect(res).toMatchObject({ ok: false, error: "stale_lifecycle" });
  });

  it("RPC missing → reject is refused (no 2-step transition + separate refund fallback)", async () => {
    const { sb, rpc } = makeSb({
      [ADMIN_DELIVERY_AD_REJECT_WITH_REFUND_RPC]: MISSING,
      admin_delivery_ad_transition: {
        data: { ok: true, campaign_id: "camp-1", from: "UNDER_REVIEW", to: "REJECTED", audit_id: "au-1" },
        error: null,
      },
    });
    const res = await adminTransitionDeliveryAdCampaign(sb, rejectInput);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([ADMIN_DELIVERY_AD_REJECT_WITH_REFUND_RPC]);
    expect(res).toEqual({
      ok: false,
      error: "rpc_failed",
      detail: `${ADMIN_DELIVERY_AD_REJECT_WITH_REFUND_RPC}_missing`,
    });
  });

  it("non-reject actions keep using admin_delivery_ad_transition directly", async () => {
    const { sb, rpc } = makeSb({
      admin_delivery_ad_transition: {
        data: { ok: true, campaign_id: "camp-1", from: "UNDER_REVIEW", to: "CHANGES_REQUESTED", audit_id: "au-2" },
        error: null,
      },
    });
    await adminTransitionDeliveryAdCampaign(sb, { ...rejectInput, action: "request_changes" });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["admin_delivery_ad_transition"]);
  });
});

describe("V3-04 DEF-7 owner submit — debit + transition single RPC", () => {
  const input = {
    ownerUserId: "owner-1",
    storeId: "store-1",
    productKind: "banner" as const,
    campaignId: "camp-1",
    action: "submit" as const,
    expectedLifecycle: "DRAFT",
    auditAction: "owner_banner_submit",
  };

  it("passes args and returns audit id", async () => {
    const { sb, rpc } = makeSb({
      [OWNER_SUBMIT_DELIVERY_AD_WITH_BC_RPC]: { data: { ok: true, audit_id: "au-9" }, error: null },
    });
    await expect(ownerSubmitDeliveryAdWithBusinessCash(sb, input)).resolves.toEqual({
      status: "ok",
      auditId: "au-9",
    });
    expect(rpc).toHaveBeenCalledWith(OWNER_SUBMIT_DELIVERY_AD_WITH_BC_RPC, {
      p_owner_user_id: "owner-1",
      p_store_id: "store-1",
      p_product_kind: "banner",
      p_campaign_id: "camp-1",
      p_action: "submit",
      p_expected_lifecycle: "DRAFT",
      p_audit_action: "owner_banner_submit",
    });
  });

  it("insufficient cash keeps the 402 payload fields", async () => {
    const { sb } = makeSb({
      [OWNER_SUBMIT_DELIVERY_AD_WITH_BC_RPC]: {
        data: {
          ok: false,
          stage: "cash",
          error: "INSUFFICIENT_BUSINESS_CASH",
          cash: {
            ok: false,
            error: "INSUFFICIENT_BUSINESS_CASH",
            available_minor: 100,
            required_minor: 500,
            shortage_minor: 400,
            currency: "PHP",
          },
        },
        error: null,
      },
    });
    const res = await ownerSubmitDeliveryAdWithBusinessCash(sb, input);
    expect(res).toMatchObject({
      status: "cash_failed",
      cash: {
        error: "INSUFFICIENT_BUSINESS_CASH",
        insufficient: { availableMinor: 100, requiredMinor: 500, shortageMinor: 400 },
      },
    });
  });

  it("transition failure (debit rolled back) maps the transition error", async () => {
    const { sb } = makeSb({
      [OWNER_SUBMIT_DELIVERY_AD_WITH_BC_RPC]: {
        data: { ok: false, stage: "transition", error: "stale_lifecycle" },
        error: null,
      },
    });
    await expect(ownerSubmitDeliveryAdWithBusinessCash(sb, input)).resolves.toEqual({
      status: "transition_failed",
      error: "stale_lifecycle",
    });
  });

  it("missing RPC (42883) → rpc_missing; other errors → rpc_error", async () => {
    const missing = makeSb({
      [OWNER_SUBMIT_DELIVERY_AD_WITH_BC_RPC]: { data: null, error: { code: "42883", message: "x" } },
    });
    await expect(ownerSubmitDeliveryAdWithBusinessCash(missing.sb, input)).resolves.toEqual({
      status: "rpc_missing",
    });
    const broken = makeSb({
      [OWNER_SUBMIT_DELIVERY_AD_WITH_BC_RPC]: { data: null, error: { code: "57014", message: "timeout" } },
    });
    await expect(ownerSubmitDeliveryAdWithBusinessCash(broken.sb, input)).resolves.toEqual({
      status: "rpc_error",
      message: "timeout",
    });
  });
});
