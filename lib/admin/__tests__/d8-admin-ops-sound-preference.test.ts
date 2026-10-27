/**
 * 재감사 D-8 ② (P-12) — 관리자 운영 알림음: 런타임 게이트만 있고 설정 화면·API 가 없던 것을 기존 설정 화면에 토글 1개로 연결.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("D-8 ② admin ops sound preference is editable and re-read", () => {
  it("settings screen mounts the toggle and saves through the canonical writer API", () => {
    expect(read("components/admin/settings/AdminNotificationDomainsSettings.tsx")).toContain(
      "<AdminOpsSoundPreferenceToggle />"
    );
    const toggle = read("components/admin/settings/AdminOpsSoundPreferenceToggle.tsx");
    expect(toggle).toContain('"/api/admin/me/notification-preferences"');
    expect(toggle).toContain("ADMIN_OPS_SOUND_PREFERENCE_CHANGED");
    const route = read("app/api/admin/me/notification-preferences/route.ts");
    expect(route).toContain("requireAdminApiUser()");
    expect(route).toMatch(/upsertAdminNotificationPreference\(\s*admin\.userId/);
    expect(route).toContain("appendAuditLog(sb, {");
    expect(route).toContain('error: "sound_enabled_required"');
  });

  it("ops sound gate re-reads the preference when it changes", () => {
    const provider = read("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(provider).toContain("window.addEventListener(ADMIN_OPS_SOUND_PREFERENCE_CHANGED, load)");
  });
});
