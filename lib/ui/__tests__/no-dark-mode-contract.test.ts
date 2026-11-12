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

  it("Tailwind dark: 변형 0건", () => {
    const hits = WEB_FILES.filter((f) => /\.(tsx?|ts)$/.test(f) && /(^|[\s"'`])dark:[a-z[]/m.test(read(f)));
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

describe("다크 모드 없음 — 상태 바·인앱 브라우저 (설계 2026-11-13 R1·R3)", () => {
  it("상태 바 LIGHT 고정 — 웹(설치본)·Capacitor 설정(새 빌드)", () => {
    const boot = read("components/platform/NativeSystemBarsLightBootstrap.tsx");
    expect(boot).toContain("SystemBars.setStyle({ style: SystemBarsStyle.Light })");
    expect(read("app/layout.tsx")).toContain("<NativeSystemBarsLightBootstrap />");
    expect(read("capacitor.config.ts")).toMatch(/SystemBars:\s*\{\s*style:\s*"LIGHT"/);
    expect(JSON.parse(read("ios/App/App/capacitor.config.json")).plugins.SystemBars.style).toBe("LIGHT");
  });

  it("웹에서 SystemBars 를 다른 스타일로 바꾸는 호출 0건", () => {
    const hits = WEB_FILES.filter((f) => /SystemBarsStyle\.(Dark|Default)|style:\s*["'](DARK|DEFAULT)["']/.test(read(f)));
    expect(hits).toEqual([]);
  });

  it("인앱 브라우저 열기는 모두 툴바 색 지정", () => {
    const calls = WEB_FILES.flatMap((f) => [...read(f).matchAll(/Browser\.open\(\{[^}]*\}\)/g)].map((m) => `${f}: ${m[0]}`));
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toContain("toolbarColor: IN_APP_BROWSER_TOOLBAR_COLOR");
  });
});

describe("다크 모드 없음 — 네이티브", () => {
  it("Android 메인 화면(WebView) 테마 = Light (isLightTheme=true → WebView 라이트 신호)", () => {
    expect(read("android/app/src/main/res/values/styles.xml")).toContain(
      '<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.Light.NoActionBar">'
    );
  });

  it("Android 일반 테마 강제 다크 제외 (설계 2026-11-13 R2)", () => {
    const xml = read("android/app/src/main/res/values/styles.xml");
    for (const name of ["AppTheme", "AppTheme.NoActionBar", "AppTheme.NoActionBarLaunch"]) {
      const start = xml.indexOf(`<style name="${name}"`);
      const block = xml.slice(start, xml.indexOf("</style>", start));
      expect(block, name).toContain('<item name="android:forceDarkAllowed" tools:targetApi="q">false</item>');
    }
  });

  it("iOS UIUserInterfaceStyle = Light", () => {
    expect(read("ios/App/App/Info.plist")).toMatch(/<key>UIUserInterfaceStyle<\/key>\s*<string>Light<\/string>/);
  });

  it("Windows WebView2 PreferredColorScheme = Light · XAML RequestedTheme = Light", () => {
    expect(read("windows/DibayDesktop/MainWindow.xaml.cs")).toContain(
      "core.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Light;"
    );
    expect(read("windows/DibayDesktop/App.xaml")).toContain('RequestedTheme="Light"');
    const win = read("windows/DibayDesktop/MainWindow.xaml.cs");
    expect(win).toContain("ApplyLightTitleBar();");
    expect(win).toContain("bar.BackgroundColor = background;");
  });
});
