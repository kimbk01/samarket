/**
 * F-09 — SECURED canonical Cash funding guards:
 *  - draft delete blocked while funding SECURED (owner sponsored/banner, admin safe-draft)
 *  - submit bind reuses the bound snapshot when funding SECURED (no re-quote)
 *  - admin refund_orphan_funding action: reason + business permission, error mapping
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hasCanonicalBcFundingSecured = vi.fn(async () => false);
vi.mock("@/lib/stores/advertising/canonical-business-cash-writer", () => ({
  hasCanonicalBcFundingSecured: (...a: unknown[]) =>
    (hasCanonicalBcFundingSecured as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/stores/advertising/delivery-ad-operations-lifecycle-fanout", () => ({
  safeFanOutDeliveryAdLifecycleAudit: vi.fn(async () => undefined),
}));

const quoteDeliveryAdApplicationCommercial = vi.fn();
const insertCampaignCommercialSnapshot = vi.fn();
const prepareOwnerPaidCampaignSnapshotFromQuote = vi.fn();
vi.mock("@/lib/stores/advertising/delivery-ad-commercial-catalog", () => ({
  quoteDeliveryAdApplicationCommercial: (...a: unknown[]) => quoteDeliveryAdApplicationCommercial(...a),
  insertCampaignCommercialSnapshot: (...a: unknown[]) => insertCampaignCommercialSnapshot(...a),
  prepareOwnerPaidCampaignSnapshotFromQuote: (...a: unknown[]) => prepareOwnerPaidCampaignSnapshotFromQuote(...a),
}));

import { deleteOwnerSponsoredDraft } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { deleteOwnerBannerDraft } from "@/lib/stores/advertising/owner-banner-writer";
import {
  adminDeleteSafeDraftDeliveryAdCampaign,
  adminRefundOrphanDeliveryAdFunding,
} from "@/lib/stores/advertising/admin-delivery-ad-writer";
import { attachOwnerPaidCommercialSnapshotOnSubmit } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";

type Row = Record<string, unknown>;

function makeSb(tables: Record<string, Row[]>, rpcImpl?: (fn: string, args: unknown) => unknown) {
  const deletes: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const sb = {
    deletes,
    rpcCalls,
    rpc: vi.fn(async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return rpcImpl ? rpcImpl(fn, args) : { data: null, error: null };
    }),
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      let mode: "select" | "delete" | "insert" = "select";
      let single = false;
      let head = false;
      const q = {
        select(_c?: string, opts?: { head?: boolean }) {
          head = opts?.head === true;
          return this;
        },
        delete() {
          mode = "delete";
          return this;
        },
        insert() {
          mode = "insert";
          return this;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return this;
        },
        in(col: string, vals: unknown[]) {
          inFilters[col] = vals;
          return this;
        },
        order() {
          return this;
        },
        maybeSingle() {
          single = true;
          return this;
        },
        then(res: (v: unknown) => void) {
          if (mode === "delete") {
            deletes.push({ table, filters: { ...filters } });
            return res({ error: null });
          }
          if (mode === "insert") return res({ error: null });
          const rows = (tables[table] ?? []).filter(
            (r) =>
              Object.entries(filters).every(([k, v]) => r[k] === v) &&
              Object.entries(inFilters).every(([k, vs]) => vs.includes(r[k]))
          );
          if (head) return res({ count: rows.length, error: null });
          if (single) return res({ data: rows[0] ?? null, error: null });
          return res({ data: rows, error: null });
        },
      };
      return q;
    },
  };
  return sb;
}

const OWNER = "owner-1";
const baseCampaign = {
  id: "camp-1",
  store_id: "store-1",
  owner_user_id: OWNER,
  lifecycle_status: "DRAFT",
  review_status: "NOT_SUBMITTED",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  hasCanonicalBcFundingSecured.mockResolvedValue(false);
});

describe("owner sponsored draft delete", () => {
  it("blocked with delete_blocked_funding_secured when funding SECURED", async () => {
    hasCanonicalBcFundingSecured.mockResolvedValue(true);
    const sb = makeSb({ store_paid_ad_campaigns: [{ ...baseCampaign }] });
    const res = await deleteOwnerSponsoredDraft(sb as never, { campaignId: "camp-1", ownerUserId: OWNER });
    expect(res).toEqual({ ok: false, error: "delete_blocked_funding_secured" });
    expect(hasCanonicalBcFundingSecured).toHaveBeenCalledWith(sb, {
      productKind: "store_sponsored",
      applicationId: "camp-1",
    });
    expect(sb.deletes).toEqual([]);
  });

  it("allowed without SECURED funding (DRAFT-filtered delete)", async () => {
    const sb = makeSb({ store_paid_ad_campaigns: [{ ...baseCampaign }] });
    const res = await deleteOwnerSponsoredDraft(sb as never, { campaignId: "camp-1", ownerUserId: OWNER });
    expect(res.ok).toBe(true);
    const campDelete = sb.deletes.find((d) => d.table === "store_paid_ad_campaigns");
    expect(campDelete?.filters).toMatchObject({ id: "camp-1", lifecycle_status: "DRAFT" });
  });
});

describe("owner banner draft delete", () => {
  it("blocked with delete_blocked_funding_secured when funding SECURED", async () => {
    hasCanonicalBcFundingSecured.mockResolvedValue(true);
    const sb = makeSb({ store_banner_ad_campaigns: [{ ...baseCampaign }] });
    const res = await deleteOwnerBannerDraft(sb as never, { campaignId: "camp-1", ownerUserId: OWNER });
    expect(res).toEqual({ ok: false, error: "delete_blocked_funding_secured" });
    expect(hasCanonicalBcFundingSecured).toHaveBeenCalledWith(sb, {
      productKind: "banner",
      applicationId: "camp-1",
    });
    expect(sb.deletes).toEqual([]);
  });

  it("allowed without SECURED funding and the DELETE filters lifecycle_status=DRAFT", async () => {
    const sb = makeSb({ store_banner_ad_campaigns: [{ ...baseCampaign }] });
    const res = await deleteOwnerBannerDraft(sb as never, { campaignId: "camp-1", ownerUserId: OWNER });
    expect(res.ok).toBe(true);
    const campDelete = sb.deletes.find((d) => d.table === "store_banner_ad_campaigns");
    expect(campDelete?.filters).toEqual({ id: "camp-1", owner_user_id: OWNER, lifecycle_status: "DRAFT" });
  });
});

describe("admin safe-draft delete", () => {
  const input = {
    adminUserId: "admin-1",
    productKind: "store_sponsored" as const,
    campaignId: "camp-1",
    expectedLifecycle: "DRAFT" as const,
    expectedUpdatedAt: "2026-10-01T00:00:00Z",
    history: {
      hasImpression: false,
      hasClick: false,
      hasAttribution: false,
      hasBilling: false,
      hasFinancialHistory: false,
      hasAuditHistory: false,
    },
  };

  it("blocked when funding SECURED", async () => {
    hasCanonicalBcFundingSecured.mockResolvedValue(true);
    const sb = makeSb({ store_paid_ad_campaigns: [{ ...baseCampaign }] });
    const res = await adminDeleteSafeDraftDeliveryAdCampaign(sb as never, input);
    expect(res).toEqual({ ok: false, error: "delete_blocked_funding_secured" });
    expect(sb.deletes).toEqual([]);
  });

  it("allowed without SECURED funding", async () => {
    const sb = makeSb({ store_paid_ad_campaigns: [{ ...baseCampaign }] });
    const res = await adminDeleteSafeDraftDeliveryAdCampaign(sb as never, input);
    expect(res.ok).toBe(true);
    expect(sb.deletes.some((d) => d.table === "store_paid_ad_campaigns")).toBe(true);
  });
});

describe("commercial bind on submit", () => {
  const bindInput = {
    campaignId: "camp-1",
    storeId: "store-1",
    productKind: "store_sponsored" as const,
    inventoryKey: "STORES_HOME_FEED",
    packageId: "pkg-1",
    clientFinalPayableMinor: 15000,
  };
  const snapshotRow = {
    campaign_id: "camp-1",
    product_kind: "store_sponsored",
    package_id: "pkg-1",
    final_payable_minor: 12000,
    currency: "PHP",
  };

  it("reuses the existing bound snapshot (no re-quote) when funding SECURED", async () => {
    hasCanonicalBcFundingSecured.mockResolvedValue(true);
    const sb = makeSb({ delivery_ad_campaign_commercial_snapshots: [snapshotRow] });
    const res = await attachOwnerPaidCommercialSnapshotOnSubmit(sb as never, bindInput);
    expect(res).toEqual({ ok: true, finalPayableMinor: 12000, currency: "PHP", packageId: "pkg-1" });
    expect(quoteDeliveryAdApplicationCommercial).not.toHaveBeenCalled();
    expect(insertCampaignCommercialSnapshot).not.toHaveBeenCalled();
  });

  it("re-quotes as before when funding is not SECURED", async () => {
    quoteDeliveryAdApplicationCommercial.mockResolvedValue({ ok: false, error: "package_inactive" });
    const sb = makeSb({ delivery_ad_campaign_commercial_snapshots: [snapshotRow] });
    const res = await attachOwnerPaidCommercialSnapshotOnSubmit(sb as never, bindInput);
    expect(quoteDeliveryAdApplicationCommercial).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ ok: false, error: "quote_unavailable" });
  });

  it("SECURED but no snapshot yet → falls through to normal quote", async () => {
    hasCanonicalBcFundingSecured.mockResolvedValue(true);
    quoteDeliveryAdApplicationCommercial.mockResolvedValue({ ok: false, error: "x" });
    const sb = makeSb({ delivery_ad_campaign_commercial_snapshots: [] });
    await attachOwnerPaidCommercialSnapshotOnSubmit(sb as never, bindInput);
    expect(quoteDeliveryAdApplicationCommercial).toHaveBeenCalledTimes(1);
  });
});

describe("adminRefundOrphanDeliveryAdFunding", () => {
  it("requires reason before calling the RPC", async () => {
    const sb = makeSb({});
    const res = await adminRefundOrphanDeliveryAdFunding(sb as never, {
      adminUserId: "a",
      productKind: "banner",
      campaignId: "c",
      reason: "  ",
    });
    expect(res).toEqual({ ok: false, error: "reason_required" });
    expect(sb.rpcCalls).toEqual([]);
  });

  it("calls the RPC with the exact contract and maps success", async () => {
    const sb = makeSb({}, () => ({ data: { ok: true, idempotent: false, refunded_minor: 12000 }, error: null }));
    const res = await adminRefundOrphanDeliveryAdFunding(sb as never, {
      adminUserId: "a",
      productKind: "banner",
      campaignId: "c",
      reason: "orphan after failed submit",
    });
    expect(sb.rpcCalls).toEqual([
      {
        fn: "business_cash_delivery_ad_refund_orphan_draft",
        args: {
          p_admin_user_id: "a",
          p_application_id: "c",
          p_product_kind: "banner",
          p_reason: "orphan after failed submit",
        },
      },
    ]);
    expect(res).toEqual({ ok: true, idempotent: false, refundedMinor: 12000 });
  });

  it.each(["not_orphan", "not_secured", "reason_required", "not_found", "forbidden", "not_admin"])(
    "passes RPC error %s through",
    async (code) => {
      const sb = makeSb({}, () => ({ data: { ok: false, error: code }, error: null }));
      const res = await adminRefundOrphanDeliveryAdFunding(sb as never, {
        adminUserId: "a",
        productKind: "store_sponsored",
        campaignId: "c",
        reason: "r",
      });
      expect(res).toEqual({ ok: false, error: code });
    }
  );
});

describe("route mappings (static)", () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

  it("owner delete route maps delete_blocked_funding_secured → 409", () => {
    const src = read("app/api/me/stores/[storeId]/delivery-ads/[campaignId]/route.ts");
    expect(src).toMatch(/case "delete_blocked_funding_secured":[\s\S]{0,80}return 409/);
  });

  it("owner actions route maps funding_required → 409", () => {
    const src = read("app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route.ts");
    expect(src).toMatch(/case "funding_required":[\s\S]{0,40}return 409/);
  });

  it("owner writers pass funding_required from owner_delivery_ad_transition through", () => {
    expect(read("lib/stores/advertising/owner-store-sponsored-writer.ts")).toContain(
      'if (code === "funding_required") return "funding_required";'
    );
    expect(read("lib/stores/advertising/owner-banner-writer.ts")).toContain(
      'if (code === "funding_required") return "funding_required";'
    );
  });
});
