import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_ACTION_QUEUE_META,
} from "@/lib/admin/admin-action-queue";
import { ADMIN_ACTIONABLE_STORE_APPROVAL } from "@/lib/admin/admin-ops-actionable-status";
import { BUSINESS_OPS_PENDING_APPROVAL } from "@/lib/admin-business/business-ops-presentation";
import {
  parseAdminStoreReportFocusRequestId,
  resolveAdminCommunityReportHref,
  resolveAdminStoreApplicationHref,
  resolveAdminStoreReportHref,
  resolveAdminTradeReportHref,
} from "@/lib/admin/admin-ops-deeplink";
import { shouldPlayAdminOpsSound } from "@/lib/admin/admin-ops-sound-decision";
import { isAdminSoundEligible } from "@/lib/notifications/admin-notification-sound-policy";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("P0-D store application NEXT-ACTION matrix", () => {
  it("ADMIN_Q uses pending|under_review only — excludes revision_requested", () => {
    expect(ADMIN_ACTIONABLE_STORE_APPROVAL).toEqual(["pending", "under_review"]);
    expect(ADMIN_ACTIONABLE_STORE_APPROVAL).not.toContain("revision_requested");
    expect(BUSINESS_OPS_PENDING_APPROVAL).toContain("revision_requested");
  });

  it("store_applications Q counts admin-actionable approval only", () => {
    const queue = read("lib/admin/admin-action-queue.ts");
    expect(queue).toContain('from("stores")');
    expect(queue).toContain("ADMIN_ACTIONABLE_STORE_APPROVAL");
    expect(queue).not.toContain("BUSINESS_OPS_PENDING_APPROVAL");
    expect(queue).toContain("ADMIN_ACTIONABLE_STORE_APPROVAL");
  });
});

describe("P0-D report Q statuses", () => {
  it("trade reports include pending|reviewing", () => {
    const queue = read("lib/admin/admin-action-queue.ts");
    expect(queue).toContain('from("reports")');
    expect(queue).toContain("TRADE_REPORT_ADMIN_ACTIONABLE");
  });

  it("reports/store_reports/community_reports are RT_REQUIRED + soundEligible", () => {
    expect(ADMIN_ACTION_QUEUE_META.reports.rt).toBe("RT_REQUIRED");
    expect(ADMIN_ACTION_QUEUE_META.reports.soundEligible).toBe(true);
    expect(ADMIN_ACTION_QUEUE_META.store_reports.rt).toBe("RT_REQUIRED");
    expect(ADMIN_ACTION_QUEUE_META.community_reports.rt).toBe("RT_REQUIRED");
    expect(ADMIN_ACTION_QUEUE_META.store_applications.rt).toBe("RT_REQUIRED");
    expect(ADMIN_ACTION_QUEUE_META.store_applications.soundEligible).toBe(true);
  });
});

describe("P0-D AdminOps bridge wiring", () => {
  it("subscribes report tables + stores on bridge only", () => {
    const provider = read("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(provider).toContain('table: "reports"');
    expect(provider).toContain('table: "store_reports"');
    expect(provider).toContain('table: "community_reports"');
    expect(provider).toContain('table: "stores"');
    expect(provider).toContain("shouldPlayAdminOpsSound");
    expect(provider).toContain("resolveAdminTradeReportHref");
    expect(provider).toContain("resolveAdminStoreApplicationHref");
  });

  it("sound policy uses stores not store_owner_applications", () => {
    expect(isAdminSoundEligible("stores")).toBe(true);
    expect(isAdminSoundEligible("store_owner_applications")).toBe(false);
    const policy = read("lib/notifications/admin-notification-sound-policy.ts");
    expect(policy).not.toContain("store_owner_applications");
    expect(policy).toContain('"stores"');
  });
});

describe("P0-D AdminStoresPage RT role split", () => {
  it("preserves list freshness RT; removes page-local toast/badge", () => {
    const page = read("components/admin/stores/AdminStoresPage.tsx");
    expect(page).toContain("admin-stores-list-freshness");
    expect(page).toContain("postgres_changes");
    expect(page).not.toContain("admin_stores_toast_new_application");
    expect(page).not.toContain("setRealtimeBadge");
    expect(page).not.toContain("setToast");
  });
});

describe("P0-D exact deeplink + consumer", () => {
  it("trade report href carries id", () => {
    expect(resolveAdminTradeReportHref("r-1")).toBe("/admin/reports/r-1");
  });

  it("community report href carries rid", () => {
    expect(resolveAdminCommunityReportHref("c-2")).toBe("/admin/community/reports?rid=c-2");
  });

  it("store report href + page parser consume request id", () => {
    expect(resolveAdminStoreReportHref("sr-3")).toBe("/admin/store-reports?request=sr-3");
    expect(parseAdminStoreReportFocusRequestId(new URLSearchParams("request=sr-3"))).toBe("sr-3");
    const page = read("components/admin/stores/AdminStoreReportsPage.tsx");
    expect(page).toContain("parseAdminStoreReportFocusRequestId");
    expect(page).toContain("admin-store-report-focused");
  });

  it("store application href carries store id", () => {
    expect(resolveAdminStoreApplicationHref("store-4")).toBe("/admin/business/store-4");
  });
});

describe("P0-D section badge source map", () => {
  it("sidebar uses bridge Q projections from admin-bell by_category", () => {
    const sidebar = read("components/admin/sidebar/AdminSidebarItem.tsx");
    expect(sidebar).toContain('"global-reports"');
    expect(sidebar).toContain("globalReportsCount");
    expect(sidebar).toContain('"reports-posts"');
    expect(sidebar).toContain("tradeReportsCount");
    expect(sidebar).toContain('"community-feed-reports"');
    expect(sidebar).toContain("communityReportsCount");
    expect(sidebar).toContain('"store-reports-admin"');
    expect(sidebar).toContain("storeReportsCount");
    expect(sidebar).toContain('"stores-commerce"');
    expect(sidebar).toContain("storeApplicationsCount");
    expect(sidebar).not.toContain("from(\"");
  });
});

describe("P0-D RT wake-up ≠ sound (T_SOUND)", () => {
  it("NEW report INSERT → sound", () => {
    expect(
      shouldPlayAdminOpsSound({
        eventType: "INSERT",
        sourceTable: "reports",
        newRow: { id: "r1", status: "pending" },
      })
    ).toBe(true);
  });

  it("pending → reviewing UPDATE → no sound", () => {
    expect(
      shouldPlayAdminOpsSound({
        eventType: "UPDATE",
        sourceTable: "reports",
        oldRow: { id: "r1", status: "pending" },
        newRow: { id: "r1", status: "reviewing" },
      })
    ).toBe(false);
  });

  it("reviewing → resolved UPDATE → no sound", () => {
    expect(
      shouldPlayAdminOpsSound({
        eventType: "UPDATE",
        sourceTable: "reports",
        oldRow: { id: "r1", status: "reviewing" },
        newRow: { id: "r1", status: "resolved" },
      })
    ).toBe(false);
  });

  it("store apply pending → under_review UPDATE → no sound", () => {
    expect(
      shouldPlayAdminOpsSound({
        eventType: "UPDATE",
        sourceTable: "stores",
        oldRow: { id: "s1", approval_status: "pending" },
        newRow: { id: "s1", approval_status: "under_review" },
      })
    ).toBe(false);
  });

  it("new store application INSERT → sound", () => {
    expect(
      shouldPlayAdminOpsSound({
        eventType: "INSERT",
        sourceTable: "stores",
        newRow: { id: "s1", approval_status: "pending" },
      })
    ).toBe(true);
  });

  it("revision_requested INSERT/UPDATE → no sound", () => {
    expect(
      shouldPlayAdminOpsSound({
        eventType: "INSERT",
        sourceTable: "stores",
        newRow: { id: "s1", approval_status: "revision_requested" },
      })
    ).toBe(false);
  });

  it("bridge uses shouldPlayAdminOpsSound before ingest on report ops", () => {
    const provider = read("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(provider).toContain("shouldPlayAdminOpsSound");
    expect(provider).toMatch(/handleReportOpsChange[\s\S]*shouldPlayAdminOpsSound/);
  });
});

describe("P0-D migration existence-first", () => {
  it("ADD TABLE only when missing; conditional RLS", () => {
    const mig = read("supabase/migrations/20261129140000_admin_ops_report_store_apply_realtime.sql");
    expect(mig).toContain("pg_publication_tables");
    expect(mig).toContain("reports");
    expect(mig).toContain("store_reports");
    expect(mig).toContain("community_reports");
    expect(mig).toContain("stores");
    expect(mig).toContain("relrowsecurity");
  });
});
