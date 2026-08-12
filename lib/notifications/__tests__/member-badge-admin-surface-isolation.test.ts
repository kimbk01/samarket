import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isMemberBadgeAuthoritySurface,
  isPlatformAdminSurfacePath,
  normalizeSurfacePathname,
} from "@/lib/notifications/member-badge-surface-authority";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("Member badge Admin surface isolation", () => {
  it("treats whole /admin domain as Platform Admin surface", () => {
    expect(normalizeSurfacePathname("/admin/order-notifications?x=1")).toBe("/admin/order-notifications");
    expect(isPlatformAdminSurfacePath("/admin")).toBe(true);
    expect(isPlatformAdminSurfacePath("/admin/")).toBe(true);
    expect(isPlatformAdminSurfacePath("/admin/order-notifications")).toBe(true);
    expect(isPlatformAdminSurfacePath("/admin/point-charges")).toBe(true);
    expect(isMemberBadgeAuthoritySurface("/admin")).toBe(false);
    expect(isMemberBadgeAuthoritySurface("/admin/order-notifications")).toBe(false);
  });

  it("keeps Member / Owner / chat surfaces on badge-count authority", () => {
    expect(isMemberBadgeAuthoritySurface("/")).toBe(true);
    expect(isMemberBadgeAuthoritySurface("/mypage")).toBe(true);
    expect(isMemberBadgeAuthoritySurface("/philife")).toBe(true);
    expect(isMemberBadgeAuthoritySurface("/market")).toBe(true);
    expect(isMemberBadgeAuthoritySurface("/community-messenger")).toBe(true);
    expect(isMemberBadgeAuthoritySurface("/stores/owner")).toBe(true);
    expect(isMemberBadgeAuthoritySurface("/post/abc")).toBe(true);
    expect(isPlatformAdminSurfacePath("/mypage")).toBe(false);
    expect(isPlatformAdminSurfacePath("/stores/owner")).toBe(false);
  });

  it("boot + badge store skip Admin surface at authority, not one-page cancel", () => {
    const boot = read("lib/app-boot/schedule-app-boot-background.ts");
    const store = read("lib/notifications/notification-badge-count-store.ts");
    const page = read("components/admin/order-notifications/AdminOrderNotificationsPageClient.tsx");
    expect(boot).toContain("isMemberBadgeAuthoritySurface");
    expect(boot).toContain("ensureInitialBadgeSnapshotForBoot");
    expect(store).toContain("isMemberBadgeAuthoritySurface");
    expect(store).toContain("admin_surface_fetch_skip");
    expect(store).toContain("admin_surface_boot_skip");
    expect(boot).not.toContain("order-notifications");
    expect(store).not.toContain("order-notifications");
    expect(page).not.toContain("/api/me/notifications");
    expect(page).toContain("/api/admin/admin-bell");
  });
});
