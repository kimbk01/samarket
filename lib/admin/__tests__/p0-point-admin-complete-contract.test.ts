import { describe, expect, it } from "vitest";
import {
  STORE_CHARGE_ACTIONABLE_STATUSES,
  USER_CHARGE_ACTIONABLE_STATUSES,
} from "@/lib/admin/admin-action-queue";
import {
  adminMemberPointChargeDetailHref,
  adminStorePointChargeFocusHref,
  parseAdminStorePointChargeFocusRequestId,
} from "@/lib/admin/admin-point-charge-deeplink";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("P0-A Admin Q authority freeze", () => {
  it("documents ADMIN_Q ≠ notification unread", () => {
    const queue = read("lib/admin/admin-action-queue.ts");
    const bell = read("app/api/admin/admin-bell/route.ts");
    const eq = read("lib/notifications/badge-equation-registry.ts");
    expect(queue).toMatch(/ADMIN_Q ≠ Member notification_events unread/);
    expect(bell).toMatch(/ADMIN_Q ≠ Member/);
    expect(eq).toMatch(/NOT notification unread/);
  });

  it("Admin shell mounts one AdminOpsRealtimeBridge provider", () => {
    const shell = read("components/admin/shell/AdminPlatformShell.tsx");
    const provider = read("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(shell).toContain("AdminStorePointPendingProvider");
    expect(provider).toContain("AdminOpsRealtimeBridge");
    expect(provider).toContain("admin-ops-realtime-bridge");
    expect(provider).toContain("adminMemberPointChargeDetailHref");
  });
});

describe("P0-B point charge actionable statuses (T1–T4)", () => {
  it("member actionable includes pending + on_hold; excludes terminal", () => {
    expect([...USER_CHARGE_ACTIONABLE_STATUSES]).toEqual([
      "pending",
      "waiting_confirm",
      "on_hold",
    ]);
    expect(USER_CHARGE_ACTIONABLE_STATUSES).not.toContain("approved");
    expect(USER_CHARGE_ACTIONABLE_STATUSES).not.toContain("rejected");
    expect(USER_CHARGE_ACTIONABLE_STATUSES).not.toContain("cancelled");
  });

  it("store actionable includes on_hold (was pending-only gap)", () => {
    expect([...STORE_CHARGE_ACTIONABLE_STATUSES]).toEqual([
      "pending",
      "waiting_confirm",
      "on_hold",
    ]);
    const queue = read("lib/admin/admin-action-queue.ts");
    expect(queue).toContain("STORE_CHARGE_ACTIONABLE_STATUSES");
    expect(queue).not.toMatch(
      /store_point_charge_requests[\s\S]{0,200}\.eq\("request_status",\s*"pending"\)/
    );
  });

  it("view-only cannot clear Q — no status mutation helpers in deeplink module", () => {
    const deeplink = read("lib/admin/admin-point-charge-deeplink.ts");
    expect(deeplink).not.toMatch(/approve|reject|request_status/);
  });
});

describe("P0-B exact deeplink (T7)", () => {
  it("member charge links to detail id route", () => {
    expect(adminMemberPointChargeDetailHref("req-1")).toBe("/admin/point-charges/req-1");
    expect(adminMemberPointChargeDetailHref("")).toBe("/admin/point-charges");
  });

  it("store charge links to list focus query", () => {
    expect(adminStorePointChargeFocusHref("req-2")).toBe(
      "/admin/store-point-charges?request=req-2"
    );
    expect(parseAdminStorePointChargeFocusRequestId(new URLSearchParams("request=req-2"))).toBe(
      "req-2"
    );
  });
});

describe("three-currency Admin mutation boundary", () => {
  it("makes historical store-credit requests read-only", () => {
    const route = read("app/api/admin/store-point-charges/[id]/route.ts");
    expect(route).toContain("historical_store_credit_read_only");
    expect(route).toContain("status: 410");
    expect(route).not.toContain("approve_store_point_charge_request");
  });

  it("preserves canonical member Point approval notifications only", () => {
    const memberRoute = read("app/api/admin/point-charges/[id]/route.ts");
    const storeRoute = read("app/api/admin/store-point-charges/[id]/route.ts");
    expect(memberRoute).toContain("notifyUserPointChargeApproved");
    expect(memberRoute).toContain("notifyUserPointChargeRejected");
    expect(memberRoute).toContain("notifyUserPointChargeOnHold");
    expect(storeRoute).not.toContain("notifyStoreOwnerPointChargeApproved");
    expect(storeRoute).not.toContain("notifyStoreOwnerPointChargeRejected");
  });
});
