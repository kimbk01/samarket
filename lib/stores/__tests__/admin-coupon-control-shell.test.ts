import { describe, expect, it } from "vitest";
import {
  classifyAdminCouponDashboardBucket,
  collectAdminCouponRecentActivity,
  parseAdminCouponControlCampaignId,
  parseAdminCouponControlRole,
  summarizeAdminCouponDashboardKpi,
} from "@/lib/stores/admin-coupon-control-shell";

describe("A1 admin coupon control shell", () => {
  it("defaults unknown view to dashboard", () => {
    expect(parseAdminCouponControlRole(null)).toBe("dashboard");
    expect(parseAdminCouponControlRole("table")).toBe("dashboard");
    expect(parseAdminCouponControlRole("list")).toBe("list");
    expect(parseAdminCouponControlRole("create")).toBe("create");
    expect(parseAdminCouponControlCampaignId(null)).toBe("");
    expect(parseAdminCouponControlCampaignId(" abc ")).toBe("abc");
  });

  it("buckets lifecycle into dashboard KPIs without a table", () => {
    expect(classifyAdminCouponDashboardBucket("requested")).toBe("waiting");
    expect(classifyAdminCouponDashboardBucket("active")).toBe("active");
    expect(classifyAdminCouponDashboardBucket("paused")).toBe("active");
    expect(classifyAdminCouponDashboardBucket("ended")).toBe("ended");
    expect(
      summarizeAdminCouponDashboardKpi([
        { lifecycle_state: "active" },
        { lifecycle_state: "requested" },
        { lifecycle_state: "ended" },
        { lifecycle_state: "revoked" },
      ])
    ).toEqual({ total: 4, active: 1, waiting: 1, ended: 2 });
  });

  it("orders recent activity by time, newest first", () => {
    const recent = collectAdminCouponRecentActivity(
      [
        {
          title: "점심 100",
          audits: [
            { created_at: "2026-08-01T00:00:00.000Z", action: "pause", actor_label: "운영" },
            { created_at: "2026-08-03T00:00:00.000Z", action: "resume", actor_label: "운영" },
          ],
        },
      ],
      8
    );
    expect(recent[0]?.action).toBe("resume");
    expect(recent).toHaveLength(2);
  });
});
