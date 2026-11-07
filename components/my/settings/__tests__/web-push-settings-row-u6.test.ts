import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldHideWebPushSettingsRow } from "@/components/my/settings/WebPushSettingsRow";

/** U-6 (Owner 「U-6 진행」 2026-11-08) — 쓸 수 없는 「브라우저 알림」 줄은 숨긴다 */
describe("WebPushSettingsRow U-6 hide rule", () => {
  const on = { ok: true, vapid_configured: true, web_push_enabled: true, subscription_count: 0, table_missing: false };

  it("Windows app (WebView2 shell) — always hidden", () => {
    expect(shouldHideWebPushSettingsRow({ windowsShell: true, loaded: true, status: on })).toBe(true);
  });

  it("phone app (Capacitor Android·iOS) — always hidden even if server web push is on (B-1)", () => {
    expect(shouldHideWebPushSettingsRow({ windowsShell: false, nativeApp: true, loaded: true, status: on })).toBe(true);
    expect(
      shouldHideWebPushSettingsRow({ windowsShell: false, nativeApp: true, loaded: true, status: { ...on, subscription_count: 3 } }),
    ).toBe(true);
  });

  it("while loading — not drawn (no skeleton-then-vanish)", () => {
    expect(shouldHideWebPushSettingsRow({ windowsShell: false, loaded: false, status: null })).toBe(true);
  });

  it("server web push off (production today: no VAPID key) — hidden", () => {
    expect(
      shouldHideWebPushSettingsRow({
        windowsShell: false,
        loaded: true,
        status: { ok: true, vapid_configured: false, web_push_enabled: false, subscription_count: 0, table_missing: false },
      }),
    ).toBe(true);
    expect(shouldHideWebPushSettingsRow({ windowsShell: false, loaded: true, status: { ...on, web_push_enabled: false } })).toBe(true);
    expect(shouldHideWebPushSettingsRow({ windowsShell: false, loaded: true, status: { ...on, table_missing: true } })).toBe(true);
    expect(shouldHideWebPushSettingsRow({ windowsShell: false, loaded: true, status: { ok: false } })).toBe(true);
  });

  it("server off but the member still has a subscription — shown so it can be removed", () => {
    expect(
      shouldHideWebPushSettingsRow({ windowsShell: false, loaded: true, status: { ...on, web_push_enabled: false, subscription_count: 1 } }),
    ).toBe(false);
  });

  it("server on (browser) — shown", () => {
    expect(shouldHideWebPushSettingsRow({ windowsShell: false, loaded: true, status: on })).toBe(false);
  });

  it("component returns null through the rule; Windows check is hydration-safe (server snapshot false)", () => {
    const src = readFileSync(join(process.cwd(), "components/my/settings/WebPushSettingsRow.tsx"), "utf8");
    expect(src).toContain("if (shouldHideWebPushSettingsRow({ windowsShell, nativeApp, loaded, status })) return null;");
    expect(src).toContain("useSyncExternalStore(subscribeNoop, isCapacitorNativePlatform, serverSnapshotFalse)");
    expect(src).toContain("useSyncExternalStore(subscribeNoop, isDibayWindowsShell, serverSnapshotFalse)");
  });
});
