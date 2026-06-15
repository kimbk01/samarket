import { describe, expect, it, vi, beforeEach } from "vitest";

const requestCloseMessengerCallNotifications = vi.fn();

vi.mock("@/lib/push/push-manager", () => ({
  requestCloseMessengerCallNotifications,
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => false,
}));

describe("dismiss-native-incoming-call-notification", () => {
  beforeEach(() => {
    requestCloseMessengerCallNotifications.mockClear();
  });

  it("always closes web notifications even on web-only shell", async () => {
    const { dismissAllIncomingCallNotifications } = await import(
      "@/lib/push/native/dismiss-native-incoming-call-notification"
    );
    await dismissAllIncomingCallNotifications("call-abc");
    expect(requestCloseMessengerCallNotifications).toHaveBeenCalledWith("call-abc");
  });

  it("ignores empty session id", async () => {
    const { dismissAllIncomingCallNotifications } = await import(
      "@/lib/push/native/dismiss-native-incoming-call-notification"
    );
    await dismissAllIncomingCallNotifications("  ");
    expect(requestCloseMessengerCallNotifications).not.toHaveBeenCalled();
  });
});
