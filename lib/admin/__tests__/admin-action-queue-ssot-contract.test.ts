import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("Admin Action Queue SSOT contract", () => {
  it("admin-bell and CP overview share loadAdminActionQueueCounts", () => {
    const bell = read("app/api/admin/admin-bell/route.ts");
    const overview = read("app/api/admin/customer-platform/overview/route.ts");
    expect(bell).toContain("loadAdminActionQueueCounts");
    expect(overview).toContain("loadAdminActionQueueCounts");
    expect(bell).not.toContain("from(\"store_point_charge_requests\")");
  });

  it("Admin order-notifications page does not use Member inbox", () => {
    const page = read("components/admin/order-notifications/AdminOrderNotificationsPageClient.tsx");
    expect(page).not.toContain("/api/me/notifications");
    expect(page).toContain("/api/admin/admin-bell");
    expect(page).not.toContain("AdminNotificationList");
  });

  it("Member badge-count runtime is excluded from whole Admin surface", () => {
    const auth = read("lib/notifications/member-badge-surface-authority.ts");
    const boot = read("lib/app-boot/schedule-app-boot-background.ts");
    const store = read("lib/notifications/notification-badge-count-store.ts");
    expect(auth).toContain("isPlatformAdminSurfacePath");
    expect(auth).toContain("isMemberBadgeAuthoritySurface");
    expect(boot).toContain("isMemberBadgeAuthoritySurface");
    expect(store).toContain("admin_surface_fetch_skip");
    expect(auth).not.toMatch(/pathname\s*===\s*["']\/admin\/order-notifications["']/);
  });

  it("migration publishes admin RT tables and admin SELECT", () => {
    const mig = read(
      "supabase/migrations/20261028120000_global_notification_ssot_owner_admin.sql"
    );
    expect(mig).toContain("store_point_charge_requests");
    expect(mig).toContain("feed_ad_requests");
    expect(mig).toContain("delivery_operation_alert_events");
    expect(mig).toContain("store_point_charge_requests_admin_select");
    expect(mig).toContain("feed_ad_requests_admin_select");
    expect(mig).toContain("store_order_sold_out");
    expect(mig).toContain("store_point_blocked");
  });

  it("admin RT provider wakes on delivery alerts", () => {
    const provider = read("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(provider).toContain("delivery_operation_alert_events");
    expect(provider).toContain("ingestAdminRowSound");
    expect(provider).not.toMatch(/setAdminBellCount\([\s\S]{0,120}ingestAdminRowSound/);
  });
});
