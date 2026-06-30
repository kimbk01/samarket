import { describe, expect, it } from "vitest";
import {
  displayNotificationSoundAssetLabel,
  displayNotificationSoundUrlFilename,
} from "@/lib/notifications/notification-sound-display-filename";

describe("notification-sound-display-filename", () => {
  it("shows label for default assets", () => {
    expect(
      displayNotificationSoundAssetLabel({ label: "기본 일반 알림", kind: "dibay_default" }, "fallback")
    ).toBe("기본 일반 알림");
  });

  it("extracts filename from storage URL", () => {
    const url = "https://example.supabase.co/storage/v1/object/public/store-order-sounds/_admin/foo/bar/my-alert.mp3";
    expect(displayNotificationSoundUrlFilename(url, "none")).toBe("my-alert.mp3");
  });

  it("prefers human label over URL for custom assets", () => {
    expect(
      displayNotificationSoundAssetLabel(
        {
          label: "order-bell.wav",
          kind: "dibay_custom",
          file_url: "https://cdn.example.com/x/uuid.wav",
        },
        "fallback"
      )
    ).toBe("order-bell.wav");
  });
});
