/**
 * 앱 업데이트 v2 (Owner 「권장안 승인」 2026-11-01) — 버전 비교 · 알림 대상 · 자동 기록 규칙.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareVersionNames,
  isInstalledOlderThanRelease,
  parseAppVersionLabel,
} from "@/lib/app-releases/app-release-version";
import { buildAppReleaseHistoryPath } from "@/lib/app-releases/app-release-paths";
import { resolveNotificationDestinationHintKey } from "@/lib/notifications/notification-destination-hint-key";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("app release version", () => {
  it("parses device labels seen in production user_devices", () => {
    expect(parseAppVersionLabel("1.2.5 (24)")).toEqual({ name: "1.2.5", code: 24 });
    expect(parseAppVersionLabel("1.0.1")).toEqual({ name: "1.0.1", code: null });
    expect(parseAppVersionLabel("1.2 (20)")).toEqual({ name: "1.2", code: 20 });
    expect(parseAppVersionLabel("")).toBeNull();
  });

  it("compares names numerically", () => {
    expect(compareVersionNames("1.2.10", "1.2.9")).toBeGreaterThan(0);
    expect(compareVersionNames("1.2", "1.2.0")).toBe(0);
  });

  it("android compares versionCode (same name 1.2.5 · build 20 < 24); unknown installed = not targeted", () => {
    const rel = { version_name: "1.2.5", version_code: 24 };
    expect(isInstalledOlderThanRelease("android", { name: "1.2.5", code: 20 }, rel)).toBe(true);
    expect(isInstalledOlderThanRelease("android", { name: "1.2.5", code: 24 }, rel)).toBe(false);
    expect(isInstalledOlderThanRelease("android", { name: "1.0.1", code: null }, rel)).toBe(true);
    expect(isInstalledOlderThanRelease("android", null, rel)).toBe(false);
    expect(isInstalledOlderThanRelease("ios", { name: "1.2", code: 20 }, { version_name: "1.3", version_code: null })).toBe(true);
  });
});

describe("destinations", () => {
  it("notification → update history page (that version); 고객센터 업데이트 = same page", () => {
    expect(buildAppReleaseHistoryPath("android", "1.2.6")).toBe("/mypage/app-updates?platform=android&v=1.2.6");
    expect(resolveNotificationDestinationHintKey("/mypage/app-updates?platform=android&v=1.2.6")).toBe(
      "notif_dest_hint_app_release"
    );
    expect(buildCustomerCenterBoardListPath("update")).toBe("/mypage/app-updates");
  });
});

describe("sync rules (contract)", () => {
  const sync = read("lib/app-releases/app-release-sync.ts");
  it("first run seeds without notifying; only completed rollouts; only older devices; dedupe per user/version", () => {
    expect(sync).toContain("res.seed = existing.length === 0");
    expect(sync).toContain("notified_at: seedMode ? now : null");
    expect(sync).toContain("if (!res.seed) res.notified = await notifyNewestRelease");
    expect(sync).toContain('r.rollout_status == null || r.rollout_status === "completed"');
    expect(sync).toContain("if (!isInstalledOlderThanRelease(platform, installed, newest)) continue;");
    expect(sync).toContain("dedupe_key: `app_release:${platform}:${newest.version_name}:${userId}`");
    expect(sync).toContain('title: notifySafeT(lang, "notify_app_release_title")');
    expect(sync).toContain("body: `DIBAY ${newest.version_name}`");
    // 기기 보고로만 안 버전은 3명 이상 설치해야 알림 (시험 빌드 직접 설치로 전체 알림 방지)
    expect(sync).toContain("export const DEVICE_SEEN_RELEASE_MIN_USERS = 3;");
    expect(sync).toContain("if (adopters < DEVICE_SEEN_RELEASE_MIN_USERS) return 0;");
  });

  it("cron registered hourly; admin has no input", () => {
    const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons.find((c) => c.path === "/api/cron/app-releases-sync")?.schedule).toBe("7 * * * *");
    expect(read("components/admin/app/AdminAppReleasesStatus.tsx")).not.toContain("<input");
  });

  it("history page: one bottom button, disabled when up to date", () => {
    const page = read("components/app-updates/AppUpdateHistoryClient.tsx");
    expect(page.match(/data-testid="app-updates-cta"/g)?.length).toBe(1);
    expect(page).toContain("disabled={!h.hasUpdate || busy}");
  });
});
