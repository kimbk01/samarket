import { describe, expect, it } from "vitest";
import { filterUserDevicePushTargets } from "@/lib/push/dispatch/filter-user-device-push-targets";

const row = (
  id: string,
  deviceId: string,
  token: string,
  provider = "fcm",
  lastSeen = "2026-06-30T10:00:00.000Z",
) => ({
  id,
  platform: "android",
  device_id: deviceId,
  push_token: token,
  push_provider: provider,
  last_seen_at: lastSeen,
  updated_at: lastSeen,
});

describe("filterUserDevicePushTargets", () => {
  it("keeps only the first FCM row when multiple active tokens exist", () => {
    const targets = filterUserDevicePushTargets([
      row("new", "cabc4186", "eIeEExQe-new", "fcm", "2026-06-30T12:00:00.000Z"),
      row("old", "dibay-mr00", "dvDcuB9H-old", "fcm", "2026-06-30T07:00:00.000Z"),
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.id).toBe("new");
    expect(targets[0]?.push_token).toBe("eIeEExQe-new");
  });

  it("allows multiple non-FCM providers with distinct device_id", () => {
    const targets = filterUserDevicePushTargets([
      row("a", "device-a", "apns-token-a", "apns"),
      row("b", "device-b", "apns-token-b", "apns"),
    ]);
    expect(targets).toHaveLength(2);
  });

  it("dedupes non-FCM rows by device_id", () => {
    const targets = filterUserDevicePushTargets([
      row("a", "same-device", "apns-token-1", "apns"),
      row("b", "same-device", "apns-token-2", "apns"),
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.id).toBe("a");
  });
});
