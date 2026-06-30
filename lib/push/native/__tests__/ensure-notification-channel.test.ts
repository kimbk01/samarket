import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureChannelMock = vi.fn(async ({ channelId }: { channelId: string }) => ({
  ok: true,
  channelId,
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({ ensureChannel: ensureChannelMock }),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
}));

describe("ensureNotificationChannel", () => {
  beforeEach(() => {
    ensureChannelMock.mockClear();
    vi.stubGlobal("window", {});
    vi.resetModules();
  });

  it("calls NotificationSoundBridge with SSOT default when id empty", async () => {
    const { ensureNotificationChannel, isNotificationChannelEnsured } = await import(
      "@/lib/push/native/ensure-notification-channel"
    );
    await ensureNotificationChannel("");
    expect(ensureChannelMock).toHaveBeenCalledWith({ channelId: "dibay_chat_messages_v1" });
    expect(isNotificationChannelEnsured("dibay_chat_messages_v1")).toBe(true);
  });

  it("calls plugin with trade channel id", async () => {
    vi.resetModules();
    const { ensureNotificationChannel } = await import("@/lib/push/native/ensure-notification-channel");
    await ensureNotificationChannel("dibay_trade_v1");
    expect(ensureChannelMock).toHaveBeenCalledWith({ channelId: "dibay_trade_v1" });
  });
});
