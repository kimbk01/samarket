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

describe("v3 rules (서버 주기 확인 없음 · 안 된 기기만 · 최소 알림)", () => {
  const rep = read("lib/app-releases/app-release-report.ts");
  it("no cron; notice only to the reporting member; silent (no push · no sound); once per build", () => {
    const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string }[] };
    expect(vercel.crons.some((c) => c.path.includes("app-releases"))).toBe(false);
    expect(rep).toContain("createNotificationEvent(sb, {");
    expect(rep).not.toContain("dispatchNotificationEvent");
    expect(rep).not.toContain("appendUserNotification");
    expect(rep).toContain('soundSuppressedReason: "user_settings"');
    expect(rep).toContain("dedupeKey: `app_release:${platform}:${availableCode}:${userId}`");
    expect(rep).toContain('title: notifySafeT(lang, "notify_app_release_title")');
    expect(rep).toContain("code > input.installed.code");
  });

  it("device reports only when installed version changed or Play says a new build exists (once per build)", () => {
    const c = read("components/app-updates/AppReleaseReporter.tsx");
    expect(c).toContain("if (readLocal(INSTALLED_KEY) === marker) return;");
    expect(c).toContain("subscribeAndroidFlexibleUpdateAvailable");
    expect(c).toContain("if (readLocal(key)) return;");
    expect(read("components/layout/MainAppProviderTree.tsx")).toContain("<AppReleaseReporterLazy />");
  });

  it("history page: one bottom button, disabled when up to date; admin has no input", () => {
    const page = read("components/app-updates/AppUpdateHistoryClient.tsx");
    expect(page.match(/data-testid="app-updates-cta"/g)?.length).toBe(1);
    expect(page).toContain("disabled={!h.hasUpdate || busy}");
    expect(read("components/admin/app/AdminAppReleasesStatus.tsx")).not.toContain("<input");
  });
});
