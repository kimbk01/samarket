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

describe("notify-then-fullscreen rules (Owner 2026-11-04 · 시안/Host 비변경)", () => {
  const rep = read("lib/app-releases/app-release-report.ts");
  const sync = read("lib/app-releases/app-release-sync.ts");
  const sources = read("lib/app-releases/app-release-sources.ts");

  it("6h cron + admin sync; auto-notify only play completed; dedupe by versionCode", () => {
    const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
    const cron = vercel.crons.find((c) => c.path === "/api/cron/app-releases-sync");
    expect(cron?.schedule).toBe("0 */6 * * *");
    expect(sync).toContain("createAndDispatchNotificationEvent");
    expect(sync).toContain("buildAppReleaseNotifyDedupeKey");
    expect(sync).toContain("isEligibleForAutoReleaseNotify");
    expect(sync).toContain("APP_RELEASE_NOTIFY_MAX_PER_RUN");
    expect(sources).toContain("tracks/production");
    expect(sources).toContain('rollout_status: r.status ?? null');
  });

  it("device availability report stays silent inbox-only (no second push path)", () => {
    expect(rep).toContain("createNotificationEvent(sb, {");
    expect(rep).not.toContain("dispatchNotificationEvent");
    expect(rep).not.toContain("appendUserNotification");
    expect(rep).toContain('soundSuppressedReason: "user_settings"');
    expect(rep).toContain("dedupeKey: `app_release:${platform}:${availableCode}:${userId}`");
  });

  it("device reports only when installed version changed or Play says a new build exists (once per build)", () => {
    const c = read("components/app-updates/AppReleaseReporter.tsx");
    expect(c).toContain("if (readLocal(INSTALLED_KEY) === marker) return;");
    expect(c).toContain("subscribeAndroidFlexibleUpdateAvailable");
    expect(c).toContain("if (readLocal(key)) return;");
    expect(read("components/layout/MainAppProviderTree.tsx")).toContain("<AppReleaseReporterLazy />");
  });

  it("history page CTA unchanged; admin has sync/confirm buttons but no free-text version input", () => {
    const page = read("components/app-updates/AppUpdateHistoryClient.tsx");
    expect(page.match(/data-testid="app-updates-cta"/g)?.length).toBe(1);
    expect(page).toContain("disabled={!h.hasUpdate || busy}");
    const admin = read("components/admin/app/AdminAppReleasesStatus.tsx");
    expect(admin).not.toContain("<input");
    expect(admin).toContain("/api/admin/app-releases/sync");
    expect(admin).toContain("/api/admin/app-releases/notify");
  });

  it("does not modify Facebook-style fullscreen screen or mockup", () => {
    expect(read("components/platform/AndroidPlayUpdateScreen.tsx").length).toBeGreaterThan(100);
    expect(read("docs/audit/android-update-fullscreen-progress-mockup-2026-11-03.html").slice(0, 20).toLowerCase()).toContain(
      "<!doctype"
    );
  });
});
