// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DIBAY_HOST_SHELL_BOOT_ATTR, DIBAY_HOST_SHELL_BOOT_SCRIPT } from "@/lib/platform/dibay-windows-shell";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
type W = Window & { chrome?: unknown };

/** B-11 (2026-11-08) — Windows 앱 로그인 첫 화면 일반 버튼→QR 깜빡임: 화면 그리기 전 표시 + CSS 로 숨김 */
describe("Windows host shell boot marker (B-11)", () => {
  afterEach(() => {
    document.documentElement.removeAttribute(DIBAY_HOST_SHELL_BOOT_ATTR);
    delete (window as W).chrome;
  });

  const run = () => new Function(DIBAY_HOST_SHELL_BOOT_SCRIPT)();

  it("marks <html> only inside WebView2 (same bridge test as isDibayWindowsShell)", () => {
    run();
    expect(document.documentElement.getAttribute(DIBAY_HOST_SHELL_BOOT_ATTR)).toBeNull();
    (window as W).chrome = { webview: { postMessage() {} } };
    run();
    expect(document.documentElement.getAttribute(DIBAY_HOST_SHELL_BOOT_ATTR)).toBeNull();
    (window as W).chrome = {
      webview: { postMessage() {}, addEventListener() {}, removeEventListener() {} },
    };
    run();
    expect(document.documentElement.getAttribute(DIBAY_HOST_SHELL_BOOT_ATTR)).toBe("windows");
  });

  it("root layout runs the script in <head> before paint", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/<head>[\s\S]*dangerouslySetInnerHTML=\{\{ __html: DIBAY_HOST_SHELL_BOOT_SCRIPT \}\}[\s\S]*<\/head>/);
  });

  it("login page: placeholder before hydration, standard methods hidden only while shell is unresolved", () => {
    const page = read("app/login/LoginPageClient.tsx");
    expect(page).toContain("{!isWindowsShell ? <PcQrLoginBootPlaceholder /> : null}");
    expect(page).toContain('data-login-standard-methods="" data-windows-shell-pending={isWindowsShell ? undefined : ""}');
    const css = read("app/auth-oauth-panel.css");
    expect(css).toMatch(/\[data-pc-qr-boot-placeholder\] \{\s*display: none;/);
    expect(css).toMatch(/html\[data-dibay-host-shell-boot="windows"\] \[data-pc-qr-boot-placeholder\] \{\s*display: block;/);
    expect(css).toMatch(
      /html\[data-dibay-host-shell-boot="windows"\] \[data-login-standard-methods\]\[data-windows-shell-pending\] \{\s*display: none;/
    );
  });
});
