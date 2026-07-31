import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminPermission = vi.fn();
const createNotificationEvent = vi.fn();
const dispatchPushForUser = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...args: unknown[]) =>
    requireAdminPermission(...args),
}));
vi.mock(
  "@/lib/notifications/core/notification-event-repository",
  () => ({
    createNotificationEvent: (...args: unknown[]) =>
      createNotificationEvent(...args),
  })
);
vi.mock("@/lib/push/dispatch/dispatch-push-for-user", () => ({
  dispatchPushForUser: (...args: unknown[]) => dispatchPushForUser(...args),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => tryCreateSupabaseServiceClient(),
}));
vi.mock("@/lib/push/dispatch/fcm-sender-impl", () => ({
  ensureFirebaseAdminApp: vi.fn(async () => ({ projectId: "test-project" })),
}));
vi.mock("@/lib/push/dispatch/read-fcm-service-account", () => ({
  fcmConfigSource: vi.fn(() => "test"),
  getFcmEnvDiagnostics: vi.fn(() => ({ source: "test" })),
  isFcmConfigured: vi.fn(() => true),
  logFcmEnvDiagnostics: vi.fn(),
}));

describe("Admin push test SSOT route", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminPermission.mockReset();
    createNotificationEvent.mockReset();
    dispatchPushForUser.mockReset();
    tryCreateSupabaseServiceClient.mockReset();

    requireAdminPermission.mockResolvedValue({
      ok: true,
      userId: "admin-1",
    });
    tryCreateSupabaseServiceClient.mockReturnValue({ from: vi.fn() });
    createNotificationEvent.mockResolvedValue({
      ok: true,
      row: {
        id: "event-1",
        user_id: "user-1",
        type: "admin_test",
        category: "admin_notice",
        title: "Test",
        body: "Body",
        created_at: "2026-07-31T00:00:00.000Z",
      },
    });
    dispatchPushForUser.mockResolvedValue({
      ok: true,
      targets_found: 1,
      deliveries: [
        {
          id: "delivery-1",
          status: "sent",
          event_type: "admin_test",
          device_id: "device-row-1",
          provider_response: {},
        },
      ],
    });
  });

  it("creates one durable, badge-excluded event before device dispatch", async () => {
    const { POST } = await import("@/app/api/admin/push/test/route");
    const response = await POST(
      new Request("https://samarket.vercel.app/api/admin/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "user-1",
          device_id: "physical-device-1",
          title: "Test",
          body: "Body",
          idempotency_key: "stable-key",
        }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(createNotificationEvent).toHaveBeenCalledTimes(1);
    expect(createNotificationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        type: "admin_test",
        category: "admin_notice",
        unread: false,
        dedupeKey: "admin-test:user-1:stable-key",
        displayPayload: expect.objectContaining({
          excludeFromBadge: true,
          targetDeviceId: "physical-device-1",
        }),
      })
    );
    expect(dispatchPushForUser).toHaveBeenCalledTimes(1);
    expect(dispatchPushForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          notification_event_id: "event-1",
          badge_count: 0,
        }),
      }),
      expect.objectContaining({
        event_type: "admin_test",
        notification_event_id: "event-1",
        target_device_id: "physical-device-1",
        badge_count: 0,
      })
    );
  });

  it("does not redispatch a duplicate idempotency key", async () => {
    createNotificationEvent.mockResolvedValue({
      ok: false,
      error: "duplicate",
      duplicate: true,
    });
    const { POST } = await import("@/app/api/admin/push/test/route");
    const response = await POST(
      new Request("https://samarket.vercel.app/api/admin/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "user-1",
          idempotency_key: "stable-key",
        }),
      }) as never
    );
    const body = await response.json();

    expect(body.duplicate).toBe(true);
    expect(dispatchPushForUser).not.toHaveBeenCalled();
  });
});
