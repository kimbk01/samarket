import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DIBAY 는 다크 모드가 없다 (Owner 2026-11-02 · 2026-11-12 「apk ios 윈도우 모두 다크 모드 적용 안 되게」).
 * 기기 시스템 테마가 다크여도 웹·네이티브 모두 라이트 고정.
 * 설계: docs/design/no-dark-mode-all-platforms-design-2026-11-12.md
 */
const ROOT = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** 통화 영역 — 통화 단독 반영(통화 변경 규정 4번)으로 따로 정리한다. */
const CALL_DARK_VARIANT_PENDING = new Set([
  "components/community-messenger/room/message/CallStubActionPopover.tsx",
  "lib/community-messenger/call-ui/incoming-call-banner-tokens.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const rel = join(dir, name);
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(css|ts|tsx|html)$/.test(name)) out.push(relative(ROOT, join(ROOT, rel)));
  }
  return out;
}

const WEB_FILES = [...walk("app"), ...walk("components"), ...walk("lib"), ...walk("hooks"), "capacitor-www/index.html"];

describe("다크 모드 없음 — 웹", () => {
  it("prefers-color-scheme: dark · color-scheme: light dark 0건", () => {
    const hits = WEB_FILES.filter((f) => {
      const s = read(f);
      return /prefers-color-scheme\s*:\s*dark/.test(s) || /color-scheme"?\s*(:|content=")\s*light dark/.test(s);
    });
    expect(hits).toEqual([]);
  });

  it("Tailwind dark: 변형 0건 (통화 정리 대기 파일 제외)", () => {
    const hits = WEB_FILES.filter(
      (f) => /\.(tsx?|ts)$/.test(f) && !CALL_DARK_VARIANT_PENDING.has(f) && /(^|[\s"'`])dark:[a-z[]/m.test(read(f))
    );
    expect(hits).toEqual([]);
  });

  it("html.dark 전역 규칙 0건", () => {
    expect(WEB_FILES.filter((f) => f.endsWith(".css") && read(f).includes("html.dark"))).toEqual([]);
  });

  it("앱 시작 화면 생성물 3곳 라이트 고정", () => {
    for (const f of [
      "capacitor-www/local-runtime/index.html",
      "android/app/src/main/assets/local-runtime/index.html",
      "ios/App/App/public/local-runtime/index.html",
    ]) {
      const s = read(f);
      expect(s, f).toContain('<meta name="color-scheme" content="light"/>');
      expect(s, f).not.toContain("prefers-color-scheme");
    }
  });
});

describe("다크 모드 없음 — 네이티브", () => {
  it("Android 메인 화면(WebView) 테마 = Light (isLightTheme=true → WebView 라이트 신호)", () => {
    expect(read("android/app/src/main/res/values/styles.xml")).toContain(
      '<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.Light.NoActionBar">'
    );
  });

  it("iOS UIUserInterfaceStyle = Light", () => {
    expect(read("ios/App/App/Info.plist")).toMatch(/<key>UIUserInterfaceStyle<\/key>\s*<string>Light<\/string>/);
  });

  it("Windows WebView2 PreferredColorScheme = Light · XAML RequestedTheme = Light", () => {
    expect(read("windows/DibayDesktop/MainWindow.xaml.cs")).toContain(
      "core.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Light;"
    );
    expect(read("windows/DibayDesktop/App.xaml")).toContain('RequestedTheme="Light"');
  });
});
