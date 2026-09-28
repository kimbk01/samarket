/**
 * @vitest-environment node
 * CUT 3 — Admin Promotion IA / action / status contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminMenu, filterMenuForPublicSidebar } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import {
  listAdminWorkspaces,
  resolveActiveWorkspace,
  resolveAdminBreadcrumb,
} from "@/lib/admin/admin-workspace-routing";
import {
  assertApproveIsNotPublishOrSend,
  assertSaveIsNotSend,
  PROMOTION_ADMIN_ACTION_META,
} from "@/lib/admin/promotion-operation-actions";
import {
  notificationDeliveryLabel,
  promotionOperatorStatusLabel,
  resolveDistributionOperatorStatus,
  resolveEventOperatorStatus,
  resolveNotificationOperatorView,
  resolveOwnerRequestOperatorStatus,
  resolvePopupOperatorStatus,
} from "@/lib/admin/promotion-operation-status";
import { VARIANT_CLASS_PROBE } from "./cut3-admin-action-button-probe";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("CUT3 Promotion IA navigation", () => {
  it("exposes promotion workspace with 5 children + home", () => {
    const promo = findAdminMenuByKey(adminMenu, "promotion");
    expect(promo).toBeTruthy();
    const keys = (promo?.children ?? []).map((c) => c.key);
    expect(keys).toEqual([
      "promotion-home",
      "promotion-events",
      "promotion-popup",
      "promotion-banners",
      "promotion-notifications",
      "promotion-owner-requests",
    ]);
    const publicAds = filterMenuForPublicSidebar(
      findAdminMenuByKey(adminMenu, "ads")?.children ?? []
    ).map((c) => c.key);
    expect(publicAds).not.toContain("ads-platform-events");
    expect(publicAds).not.toContain("ads-platform-popup");
    expect(listAdminWorkspaces("master").some((w) => w.id === "promotion")).toBe(true);
    expect(listAdminWorkspaces("master").some((w) => w.id === "ads")).toBe(true);
  });

  it("routes resolve under promotion (not ads)", () => {
    expect(resolveActiveWorkspace("/admin/platform-events", "master").id).toBe("promotion");
    expect(resolveActiveWorkspace("/admin/platform-popup", "master").id).toBe("promotion");
    expect(resolveActiveWorkspace("/admin/platform-promotion/banners", "master").id).toBe(
      "promotion"
    );
    expect(resolveActiveWorkspace("/admin/platform-promotion/notifications", "master").id).toBe(
      "promotion"
    );
    expect(resolveActiveWorkspace("/admin/platform-event-owner-requests", "master").id).toBe(
      "promotion"
    );
    expect(resolveActiveWorkspace("/admin/advertising", "master").id).toBe("ads");
    expect(resolveActiveWorkspace("/admin/advertising/placements", "master").id).toBe("ads");
  });

  it("breadcrumbs start with promotion", () => {
    const ws = resolveActiveWorkspace("/admin/platform-events", "master");
    const crumbs = resolveAdminBreadcrumb("/admin/platform-events", ws);
    expect(crumbs[0]?.key).toBe("promotion");
    expect(crumbs.some((c) => c.key === "promotion-events")).toBe(true);
  });
});

describe("CUT3 status + action SSOT", () => {
  it("maps event edge cases deterministically", () => {
    const now = Date.parse("2026-06-15T12:00:00+08:00");
    expect(resolveEventOperatorStatus({ status: "draft" }, now)).toBe("DRAFT");
    expect(
      resolveEventOperatorStatus(
        { status: "published", startsAt: "2026-07-01T00:00:00+08:00" },
        now
      )
    ).toBe("SCHEDULED");
    expect(
      resolveEventOperatorStatus(
        {
          status: "published",
          startsAt: "2026-01-01T00:00:00+08:00",
          endsAt: "2026-12-01T00:00:00+08:00",
        },
        now
      )
    ).toBe("ACTIVE");
    expect(resolveEventOperatorStatus({ status: "unpublished" }, now)).toBe("PAUSED");
    expect(
      resolveEventOperatorStatus(
        { status: "published", endsAt: "2026-01-01T00:00:00+08:00" },
        now
      )
    ).toBe("ENDED");
    expect(promotionOperatorStatusLabel("ACTIVE", "ko")).toBe("노출 중");
  });

  it("maps popup / distribution / notification / owner adapters", () => {
    expect(resolvePopupOperatorStatus({ status: "paused" })).toBe("PAUSED");
    expect(resolvePopupOperatorStatus({ status: "active" })).toBe("ACTIVE");
    expect(resolveDistributionOperatorStatus({ status: "disabled", enabled: false })).toBe(
      "PAUSED"
    );
    expect(resolveDistributionOperatorStatus({ status: "active", enabled: true })).toBe("ACTIVE");
    const notif = resolveNotificationOperatorView({ status: "sent", sentAt: "2026-01-01" });
    expect(notif).toEqual({ kind: "delivery", delivery: "sent" });
    expect(notificationDeliveryLabel("sent", "ko")).toBe("발송됨");
    expect(resolveOwnerRequestOperatorStatus("under_review")).toBe("UNDER_REVIEW");
    expect(resolveOwnerRequestOperatorStatus("approved")).toBe("APPROVED");
  });

  it("SAVE ≠ SEND and APPROVE ≠ PUBLISH/SEND", () => {
    expect(assertSaveIsNotSend()).toBe(true);
    expect(assertApproveIsNotPublishOrSend()).toBe(true);
    expect(PROMOTION_ADMIN_ACTION_META.SEND_PUSH.confirm).toBe(true);
    expect(PROMOTION_ADMIN_ACTION_META.APPROVE.customerVisible).toBe(false);
  });
});

describe("CUT3 button contrast contract + no new writer", () => {
  it("AdminActionButton locks primary fg/bg tokens (not bare sam-primary)", () => {
    const src = read("components/admin/ui/AdminActionButton.tsx");
    expect(src).toContain("--admin-action-primary-bg");
    expect(src).toContain("--admin-action-primary-fg");
    expect(src).not.toMatch(/\bbg-sam-primary\b/);
    expect(src).toContain('"quiet"');
    expect(VARIANT_CLASS_PROBE.primaryFgLocked).toBe(true);
  });

  it("banner list API is GET-only; no customer runtime host changes in this CUT", () => {
    const api = read("app/api/admin/platform-promotion/banners/route.ts");
    expect(api).toContain("export async function GET");
    expect(api).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    const feed = read("components/community/CommunityFeed.tsx");
    expect(feed).toContain("EventPromotionHeroBanner");
    const hero = read("components/platform-events/EventPromotionHeroBanner.tsx");
    expect(hero).toContain('data-paid-side-effect="0"');
  });

  it("popup hub no longer redirects into Paid Ads operations", () => {
    const page = read("app/admin/platform-popup/page.tsx");
    expect(page).not.toContain("advertising/operations");
    expect(page).toContain("AdminPlatformPopupListPage");
  });
});
