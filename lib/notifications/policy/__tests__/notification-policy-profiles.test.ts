import { describe, expect, it } from "vitest";
import {
  resolveNotificationPolicyProfile,
  shouldUseOsNotificationForState,
} from "@/lib/notifications/policy/notification-policy-profiles";
import { resolveNotificationSoundProfile } from "@/lib/notifications/policy/notification-sound-profiles";

describe("notification policy profiles", () => {
  it("suppresses incoming call signal from normal OS tray contract", () => {
    const profile = resolveNotificationPolicyProfile("incoming_call_signal");
    expect(profile.badgeEnabled).toBe(false);
    expect(profile.backgroundBehavior).toBe("none");
    expect(shouldUseOsNotificationForState(profile, "background")).toBe(false);
  });

  it("routes admin marketing to bottom banner policy and marketing channel", () => {
    const profile = resolveNotificationPolicyProfile("admin_marketing_banner");
    const sound = resolveNotificationSoundProfile("admin_marketing_banner");
    expect(profile.foregroundBehavior).toBe("in_app_bottom_banner");
    expect(sound.androidChannelId).toBe("dibay_marketing");
  });

  it("keeps chat_message as badge-enabled background notification", () => {
    const profile = resolveNotificationPolicyProfile("chat_message");
    expect(profile.badgeEnabled).toBe(true);
    expect(shouldUseOsNotificationForState(profile, "background")).toBe(true);
  });
});
