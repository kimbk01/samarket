import { describe, expect, it } from "vitest";
import {
  buildAppReleaseNotifyDedupeKey,
  isEligibleForAdminConfirmedNotify,
  isEligibleForAutoReleaseNotify,
  isPlayRolloutCompletedForAutoNotify,
  isTrustedActiveDeviceForNotify,
  shouldNotifyUserForRelease,
} from "@/lib/app-releases/app-release-notify-policy";
import { parseAppVersionLabel } from "@/lib/app-releases/app-release-version";

describe("app-release-notify-policy", () => {
  it("auto-notify only play_api + completed + versionCode", () => {
    expect(
      isEligibleForAutoReleaseNotify({
        id: "1",
        platform: "android",
        version_name: "1.2.5",
        version_code: 37,
        rollout_status: "completed",
        source: "play_api",
        notified_at: null,
      })
    ).toBe(true);

    expect(
      isEligibleForAutoReleaseNotify({
        id: "2",
        platform: "android",
        version_name: "1.2.5",
        version_code: 37,
        rollout_status: "inProgress",
        source: "play_api",
        notified_at: null,
      })
    ).toBe(false);

    expect(
      isEligibleForAutoReleaseNotify({
        id: "3",
        platform: "android",
        version_name: "1.2.5",
        version_code: 37,
        rollout_status: "completed",
        source: "device_seen",
        notified_at: null,
      })
    ).toBe(false);
  });

  it("admin confirm allows non-completed with versionCode", () => {
    expect(
      isEligibleForAdminConfirmedNotify({
        id: "1",
        platform: "android",
        version_name: "1.2.5",
        version_code: 37,
        rollout_status: "inProgress",
        source: "play_api",
        notified_at: null,
      })
    ).toBe(true);
  });

  it("completed status gate", () => {
    expect(isPlayRolloutCompletedForAutoNotify("completed")).toBe(true);
    expect(isPlayRolloutCompletedForAutoNotify("inProgress")).toBe(false);
    expect(isPlayRolloutCompletedForAutoNotify(null)).toBe(false);
  });

  it("dedupe key uses versionCode for android identity", () => {
    expect(buildAppReleaseNotifyDedupeKey("android", 37, "u1")).toBe("app_release:android:37:u1");
  });

  it("trusted device requires 90d last_seen and android versionCode", () => {
    const now = Date.parse("2026-11-04T12:00:00Z");
    const ok = isTrustedActiveDeviceForNotify({
      platform: "android",
      appVersion: "1.2.5 (24)",
      lastSeenAt: "2026-10-01T00:00:00Z",
      nowMs: now,
    });
    expect(ok.ok).toBe(true);

    const stale = isTrustedActiveDeviceForNotify({
      platform: "android",
      appVersion: "1.2.5 (24)",
      lastSeenAt: "2026-01-01T00:00:00Z",
      nowMs: now,
    });
    expect(stale).toEqual({ ok: false, reason: "last_seen_stale" });

    const noCode = isTrustedActiveDeviceForNotify({
      platform: "android",
      appVersion: "1.2.5",
      lastSeenAt: "2026-10-01T00:00:00Z",
      nowMs: now,
    });
    expect(noCode).toEqual({ ok: false, reason: "android_version_code_missing" });
  });

  it("outdated vs release by versionCode", () => {
    const installed = parseAppVersionLabel("1.2.5 (24)");
    expect(
      shouldNotifyUserForRelease("android", installed, { version_name: "1.2.5", version_code: 37 })
    ).toBe(true);
    expect(
      shouldNotifyUserForRelease("android", parseAppVersionLabel("1.2.5 (37)"), {
        version_name: "1.2.5",
        version_code: 37,
      })
    ).toBe(false);
  });
});
