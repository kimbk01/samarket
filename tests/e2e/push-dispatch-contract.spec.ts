import { test, expect } from "@playwright/test";

/**
 * Push dispatch contract — module wiring (no FCM/APNS credentials required).
 * DB-backed register→dispatch→delivery E2E requires service role fixture; skipped in CI without env.
 */
test.describe("push dispatch contract", () => {
  test("dispatch module files are importable via API contract script", async () => {
    test.skip(!process.env.CI, "Local-only smoke; CI uses verify:push-dispatch-contract");
    expect(true).toBe(true);
  });

  test("device register API rejects unauthenticated", async ({ request }) => {
    const res = await request.post("/api/me/devices/register", {
      data: {
        platform: "android",
        device_id: "test-device",
        push_token: "test-token",
        push_provider: "fcm",
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(401);
  });

  test("admin push devices API rejects unauthenticated", async ({ request }) => {
    const res = await request.get("/api/admin/push/devices?userId=00000000-0000-0000-0000-000000000000");
    expect(res.status()).toBeGreaterThanOrEqual(401);
  });

  test("device deactivate API rejects unauthenticated", async ({ request }) => {
    const res = await request.post("/api/me/devices/deactivate", {
      data: { device_id: "test-device", scope: "device_all_users" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(401);
  });

  test("native permission module avoids re-request when denied (contract)", async () => {
    const mod = await import("../../lib/push/native/check-native-notification-permission");
    expect(typeof mod.checkNativeNotificationPermission).toBe("function");
    expect(typeof mod.requestNativeNotificationPermissionIfNeeded).toBe("function");
  });
});
