import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ADS_HISTORY_EVENT_AUTHORITY_MATRIX,
  ADS_HISTORY_EXPORT_AVAILABLE,
} from "@/lib/admin/ads-history/event-authority-matrix";
import { ADS_HISTORY_FORBIDDEN_PRICE_FALLBACKS } from "@/lib/admin/ads-history/historical-amount";
import {
  projectBoostHistoryRow,
  projectDeliveryHistoryRow,
  projectFeedBannerHistoryRow,
  projectPopupAdminHistoryRow,
  projectPopupOwnerLegacyHistoryRow,
} from "@/lib/admin/ads-history/project-history-timeline";
import { filterAdsHistoryRows } from "@/lib/admin/ads-history/load-ads-history-ledger";
import { ADS_CANONICAL_PRODUCTS } from "@/lib/ads/ads-canonical-product-ssot";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

describe("CUT R7 ads history ledger", () => {
  it("covers 7 canonical product keys in authority matrix", () => {
    const keys = ADS_HISTORY_EVENT_AUTHORITY_MATRIX.map((m) => m.productKey);
    expect(keys).toEqual([
      "community_boost",
      "trade_boost",
      "delivery_store_sponsored",
      "community_banner",
      "trade_banner",
      "delivery_home_banner",
      "popup",
    ]);
    for (const k of Object.keys(ADS_CANONICAL_PRODUCTS)) {
      expect(keys).toContain(k);
    }
  });

  it("never falls back to current catalog price helpers", () => {
    const loader = read("lib/admin/ads-history/load-ads-history-ledger.ts");
    const amount = read("lib/admin/ads-history/historical-amount.ts");
    const project = read("lib/admin/ads-history/project-history-timeline.ts");
    for (const forbidden of ADS_HISTORY_FORBIDDEN_PRICE_FALLBACKS) {
      expect(loader).not.toContain(forbidden);
      expect(project).not.toContain("delivery_ad_packages");
      expect(project).not.toContain("feed_ad_products");
    }
    expect(amount).toContain("NEVER fall back");
    expect(loader).toContain("final_payable_minor");
    expect(loader).toContain("point_cost");
  });

  it("Boost has no approval event and no invented refund", () => {
    const row = projectBoostHistoryRow({
      id: "b1",
      domain: "community",
      orderStatus: "ended",
      createdAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-04T00:00:00.000Z",
      startAt: "2026-09-01T00:00:00.000Z",
      targetTitle: "Post",
      userId: "user-12345678",
      pointCost: 300,
    });
    expect(row.historicalAmountLabel).toBe("300 Point");
    expect(row.historicalAmountProven).toBe(true);
    expect(row.timeline.some((e) => e.kind === "approval" && e.evidence === "event")).toBe(false);
    expect(row.timeline.some((e) => e.labelKo === "승인" && e.evidence === "gap")).toBe(true);
    expect(row.timeline.some((e) => e.kind === "refund" && e.evidence === "event")).toBe(false);
    expect(row.gapsKo.some((g) => g.includes("환불"))).toBe(true);
  });

  it("Admin Direct feed banner has no payment and no approval workflow", () => {
    const row = projectFeedBannerHistoryRow({
      id: "c1",
      domain: "trade",
      kind: "campaign",
      status: "ended",
      createdAt: "2026-09-01T00:00:00.000Z",
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-03T00:00:00.000Z",
      title: "Admin banner",
      placement: "TRADE_HOME",
      source: "ADMIN_DIRECT",
      userId: null,
      createdBy: "admin-1",
      pointCost: 9999,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
    });
    expect(row.paymentState).toBe("none");
    expect(row.historicalAmountLabel).toBeNull();
    expect(row.timeline.some((e) => e.evidenceNoteKo?.includes("결제 없음"))).toBe(true);
    expect(row.timeline.some((e) => e.evidenceNoteKo?.includes("승인 절차 없음"))).toBe(true);
  });

  it("does not use requested placement as invented actual exposure", () => {
    const row = projectFeedBannerHistoryRow({
      id: "r1",
      domain: "community",
      kind: "request",
      status: "active",
      createdAt: "2026-09-01T00:00:00.000Z",
      startAt: null,
      endAt: null,
      title: "Req",
      placement: "COMMUNITY_HOME",
      source: "request",
      userId: "u1",
      createdBy: null,
      pointCost: 500,
      reviewedBy: "admin-9",
      reviewedAt: "2026-09-01T01:00:00.000Z",
      reviewReason: null,
    });
    expect(row.placementLabelKo).toBe("COMMUNITY_HOME");
    expect(row.timeline.some((e) => e.kind === "runtime_exposure" && e.evidence === "gap")).toBe(
      true
    );
  });

  it("orders timeline chronologically and never guesses actor", () => {
    const row = projectDeliveryHistoryRow({
      id: "d1",
      product: "banner",
      title: "Hero",
      campaignSource: "OWNER_PAID",
      ownerUserId: "owner-1",
      lifecycleStatus: "ENDED",
      reviewStatus: "APPROVED",
      createdAt: "2026-09-01T00:00:00.000Z",
      submittedAt: "2026-09-01T00:00:00.000Z",
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-10T00:00:00.000Z",
      inventoryKeys: ["STORES_HOME_HERO"],
      sortOrder: 1,
      finalPayableMinor: 150000,
      currency: "PHP",
      audits: [
        {
          action: "pause",
          actorType: "admin",
          actorUserId: null,
          reason: null,
          createdAt: "2026-09-02T00:00:00.000Z",
        },
        {
          action: "approve",
          actorType: "admin",
          actorUserId: "adm-1",
          reason: null,
          createdAt: "2026-09-01T02:00:00.000Z",
        },
      ],
      refundProven: false,
      refundAmountLabel: null,
      impressionCount: null,
    });
    const dated = row.timeline.filter((e) => e.at);
    for (let i = 1; i < dated.length; i += 1) {
      expect(dated[i]!.at! >= dated[i - 1]!.at!).toBe(true);
    }
    const pause = row.timeline.find((e) => e.labelKo === "일시중지");
    expect(pause?.actorProven).toBe(false);
    expect(row.historicalAmountLabel).toContain("PHP");
    expect(row.timeline.some((e) => e.kind === "refund" && e.evidence === "gap")).toBe(true);
  });

  it("preserves legacy owner popup as non-sellable and does not infer refund from reject", () => {
    const row = projectPopupOwnerLegacyHistoryRow({
      id: "p1",
      title: "Old popup",
      requestStatus: "rejected",
      createdAt: "2026-08-01T00:00:00.000Z",
      ownerUserId: "o1",
      storeId: "s1",
      priceMinor: 20000,
      currency: "PHP",
      paymentStatus: "funded",
    });
    expect(row.legacy).toBe(true);
    expect(row.sellable).toBe(false);
    expect(row.paymentState).not.toBe("refunded");
    expect(row.timeline.some((e) => e.kind === "refund" && e.evidence === "gap")).toBe(true);
  });

  it("Popup admin direct is unpaid and non-sellable", () => {
    const row = projectPopupAdminHistoryRow({
      id: "pc1",
      name: "System popup",
      status: "ended",
      approvalStatus: "approved",
      createdAt: "2026-09-01T00:00:00.000Z",
      createdBy: "admin-2",
      approvedBy: "admin-2",
      approvedAt: "2026-09-01T00:10:00.000Z",
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-05T00:00:00.000Z",
      ownerRequestId: null,
    });
    expect(row.paymentState).toBe("none");
    expect(row.sellable).toBe(false);
    expect(row.legacy).toBe(false);
  });

  it("history page and API are read-only (no mutation writer)", () => {
    const page = read("app/admin/advertising/history/page.tsx");
    const view = read("components/admin/ads/AdminAdsHistoryLedgerView.tsx");
    const api = read("app/api/admin/advertising/history/route.ts");
    expect(page).toContain("AdminAdsHistoryLedgerView");
    expect(page).not.toContain('mode="history"');
    expect(view).toContain('data-ads-history-mutation="0"');
    expect(view).not.toContain("advertising-workspace/action");
    expect(api).toContain("export async function GET");
    expect(api).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/);
    expect(ADS_HISTORY_EXPORT_AVAILABLE).toBe(false);
  });

  it("filter helper keeps refund semantics evidence-bound", () => {
    const boost = projectBoostHistoryRow({
      id: "b2",
      domain: "trade",
      orderStatus: "ended",
      createdAt: "2026-09-01T00:00:00.000Z",
      endAt: "2026-09-02T00:00:00.000Z",
      startAt: null,
      targetTitle: "T",
      userId: "u",
      pointCost: 100,
    });
    expect(filterAdsHistoryRows([boost], { status: "refunded" })).toHaveLength(0);
    expect(filterAdsHistoryRows([boost], { status: "ended" }).length).toBe(1);
    expect(filterAdsHistoryRows([boost], { domain: "community" })).toHaveLength(0);
    expect(filterAdsHistoryRows([boost], { domain: "trade" }).length).toBe(1);
  });

  it("canonical links stay on advertising routes", () => {
    const project = read("lib/admin/ads-history/project-history-timeline.ts");
    const view = read("components/admin/ads/AdminAdsHistoryLedgerView.tsx");
    expect(project).toContain("/admin/advertising/applications");
    expect(project).toContain("/admin/advertising/operations");
    expect(project).toContain("/admin/advertising/boosts");
    expect(view).not.toContain("/admin/growth");
    expect(view).not.toContain("/admin/ads-center");
    expect(view).not.toContain("advertising-workspace/action");
  });
});
