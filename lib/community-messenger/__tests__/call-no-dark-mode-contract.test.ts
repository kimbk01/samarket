import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DIBAY 는 다크 모드가 없다 — 통화 화면 포함 (Owner 2026-11-12 「통화 포함 진행」).
 * 설계: docs/design/no-dark-mode-all-platforms-design-2026-11-12.md §2·§4
 */
const ROOT = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("통화 화면 다크 모드 없음", () => {
  it("통화 웹 화면 dark: 변형 0건", () => {
    for (const f of [
      "components/community-messenger/room/message/CallStubActionPopover.tsx",
      "lib/community-messenger/call-ui/incoming-call-banner-tokens.ts",
    ]) {
      expect(read(f), f).not.toMatch(/(^|[\s"'`])dark:[a-z[]/m);
    }
  });

  it("Tailwind dark: 는 기기 다크를 따르지 않음 (.dark 클래스 전용으로 고정)", () => {
    expect(read("app/globals.css")).toContain("@custom-variant dark (&:where(.dark, .dark *));");
  });

  it("Android 통화 화면 테마 = Light", () => {
    const xml = read("android/app/src/main/res/values/styles.xml");
    expect(xml).toContain('<style name="AppTheme.IncomingCall" parent="Theme.AppCompat.Light.NoActionBar">');
    expect(xml).toContain('<style name="AppTheme.ForegroundIncomingCall" parent="Theme.AppCompat.Light.NoActionBar">');
  });

  it("Android 통화 화면 테마 강제 다크 제외 (설계 2026-11-13 R2-b)", () => {
    const xml = read("android/app/src/main/res/values/styles.xml");
    for (const name of ["AppTheme.IncomingCall", "AppTheme.ForegroundIncomingCall"]) {
      const start = xml.indexOf(`<style name="${name}"`);
      const block = xml.slice(start, xml.indexOf("</style>", start));
      expect(block, name).toContain('<item name="android:forceDarkAllowed" tools:targetApi="q">false</item>');
    }
  });
});
