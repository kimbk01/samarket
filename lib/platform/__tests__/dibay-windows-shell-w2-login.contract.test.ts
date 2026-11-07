// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIBAY_WINDOWS_SHELL_BRIDGE_VERSION,
  isDibayWindowsShellAuthReturnAvailable,
  openDibayWindowsShellSystemBrowser,
  parseDibayWindowsShellAuthReturn,
  resetDibayWindowsShellBrowserLoginSupportForTests,
  subscribeDibayWindowsShellAuthReturn,
  supportsDibayWindowsShellBrowserLogin,
} from "@/lib/platform/dibay-windows-shell";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

type Listener = (event: { data: unknown }) => void;

function installFakeShell(bridgeVersion: number | null) {
  const listeners = new Set<Listener>();
  const emit = (data: unknown) => listeners.forEach((l) => l({ data }));
  const posted: unknown[] = [];
  const webview = {
    postMessage: vi.fn((msg: unknown) => {
      posted.push(msg);
      const m = msg as { type?: string };
      if (m.type === "app.info" && bridgeVersion != null) {
        emit({ type: "app.info", shell: "windows", bridgeVersion, appVersion: "0.2.0.0" });
      }
    }),
    addEventListener: (_t: "message", l: Listener) => listeners.add(l),
    removeEventListener: (_t: "message", l: Listener) => listeners.delete(l),
  };
  (window as unknown as { chrome?: unknown }).chrome = { webview };
  return { posted, emit, listeners };
}

/**
 * Windows 셸 W2 (Owner 「W2 구현」 → 되돌림 → 「구글은 다른 창이면 그렇게」 2026-11-08 · 인증 잠금 트리거 5)
 * — **Google 로그인만** 기본 브라우저로. 카카오·Apple 은 같은 창.
 * 계획서: docs/audit/windows-shell-w2-login-plan-2026-11-08.md
 */
describe("Windows shell W2 — browser login bridge", () => {
  beforeEach(() => resetDibayWindowsShellBrowserLoginSupportForTests());
  afterEach(() => {
    delete (window as unknown as { chrome?: unknown }).chrome;
  });

  it("bridge v2 shell supports browser login; v1 (W0 build) and non-shell do not", async () => {
    expect(DIBAY_WINDOWS_SHELL_BRIDGE_VERSION).toBe(2);
    await expect(supportsDibayWindowsShellBrowserLogin()).resolves.toBe(false); // 브라우저
    installFakeShell(1);
    await expect(supportsDibayWindowsShellBrowserLogin()).resolves.toBe(false); // W0 셸
    resetDibayWindowsShellBrowserLoginSupportForTests();
    installFakeShell(2);
    await expect(supportsDibayWindowsShellBrowserLogin()).resolves.toBe(true);
  });

  it("auth.open sends the authorize URL to the shell", () => {
    expect(openDibayWindowsShellSystemBrowser("https://x.supabase.co/auth/v1/authorize?p=1")).toBe(false);
    const shell = installFakeShell(2);
    expect(openDibayWindowsShellSystemBrowser("https://x.supabase.co/auth/v1/authorize?p=1")).toBe(true);
    expect(shell.posted).toContainEqual({
      type: "auth.open",
      bridgeVersion: 2,
      url: "https://x.supabase.co/auth/v1/authorize?p=1",
    });
  });

  it("auth.return accepts dibay://auth/callback only", () => {
    expect(parseDibayWindowsShellAuthReturn({ type: "auth.return", url: "dibay://auth/callback?code=a" })).toBe(
      "dibay://auth/callback?code=a",
    );
    expect(parseDibayWindowsShellAuthReturn({ type: "auth.return", url: "dibay://evil/callback?code=a" })).toBeNull();
    expect(parseDibayWindowsShellAuthReturn({ type: "auth.return", url: "https://x/auth/callback" })).toBeNull();
    expect(parseDibayWindowsShellAuthReturn({ type: "app.info" })).toBeNull();
    expect(isDibayWindowsShellAuthReturnAvailable({ type: "auth.return.available" })).toBe(true);
  });

  it("available → web requests → shell returns once → delivered", () => {
    const shell = installFakeShell(2);
    const got: string[] = [];
    const off = subscribeDibayWindowsShellAuthReturn((u) => got.push(u));
    shell.emit({ type: "auth.return.available" });
    expect(shell.posted).toContainEqual({ type: "auth.return.request", bridgeVersion: 2 });
    shell.emit({ type: "auth.return", url: "dibay://auth/callback?code=c1" });
    expect(got).toEqual(["dibay://auth/callback?code=c1"]);
    off();
    shell.emit({ type: "auth.return", url: "dibay://auth/callback?code=c2" });
    expect(got).toEqual(["dibay://auth/callback?code=c1"]);
  });

  it("login hook: Windows branch runs before the Capacitor branch and only for a v2 shell", () => {
    const src = read("lib/auth/oauth/use-oauth-login.ts");
    const winIdx = src.indexOf("&& (await supportsDibayWindowsShellBrowserLogin())");
    const capIdx = src.indexOf('if (routing.action === "web_oauth_start" && isNativeAppOAuthShell())');
    expect(winIdx).toBeGreaterThan(0);
    expect(capIdx).toBeGreaterThan(winIdx);
    // Google 만 기본 브라우저 — 카카오·Apple 은 같은 창(W0) (Owner 2026-11-08)
    expect(src).toMatch(/provider === "google"\s*&& routing\.action === "web_oauth_start"\s*&& isDibayWindowsShell\(\)/);
    expect(src).toContain("await runWindowsShellBrowserOAuth(provider, next);");
    expect(src).toContain('if (code === "windows_browser_open_failed") return t("auth_windows_browser_open_failed");');
    // 방식 결정표는 바꾸지 않는다 (계획서 §2-2)
    expect(read("lib/auth/oauth/oauth-native-routing.ts")).not.toMatch(/windows/i);
  });

  it("server path is the existing native one (launch=native → capacitor-return); no Capacitor bridge wait", () => {
    const src = read("lib/auth/oauth/start-oauth-login.ts");
    const fn = src.slice(src.indexOf("export async function fetchWindowsShellOAuthAuthorizeUrl"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toContain("buildNativeStartPath(provider, next)");
    expect(body).toContain("isNativeOAuthSupabaseRedirectUrl(redirectTo)");
    expect(body).not.toMatch(/waitForCapacitorBridgeReady|flushAndroidAuthCookies/);
  });

  it("return listener is mounted globally and uses the single native return bridge", () => {
    expect(read("app/layout.tsx")).toContain("<WindowsShellOAuthReturnListener />");
    const listener = read("components/auth/WindowsShellOAuthReturnListener.tsx");
    expect(listener).toContain('deliverNativeOAuthReturnUrl(nativeUrl, "windows_shell")');
    expect(listener).toContain("if (!isDibayWindowsShell()) return;");
    expect(listener).toContain("requestDibayWindowsShellPendingAuthReturn();");
  });

  it("waiting copy shows only inside the Windows shell", () => {
    expect(read("components/auth/OAuthInlineLoginHint.tsx")).toMatch(
      /isDibayWindowsShell\(\)\s*\?\s*t\("auth_windows_browser_login_waiting"\)\s*:\s*t\("auth_oauth_return_hint"\)/,
    );
    expect(read("components/auth/OAuthProviderLoginPanel.tsx")).toContain(
      'if (isDibayWindowsShell()) return t("auth_windows_browser_login_waiting");',
    );
  });

  it("shell: dibay protocol, single instance, Supabase-only auth.open, return sent once", () => {
    const manifest = read("windows/DibayDesktop/Package.appxmanifest");
    expect(manifest).toContain('<uap:Extension Category="windows.protocol">');
    expect(manifest).toContain('<uap:Protocol Name="dibay">');
    expect(manifest).toContain('Version="0.4.0.0"');
    expect(read("windows/DibayDesktop/DibayDesktop.csproj")).toContain("DISABLE_XAML_GENERATED_MAIN");
    const program = read("windows/DibayDesktop/Program.cs");
    // CS0029 재발 방지 — 람다 매개변수를 `_` 로 두지 않는다
    expect(program).toContain("Application.Start(p =>");
    expect(program).not.toMatch(/Application\.Start\(_ =>/);
    expect(program).toContain("AppInstance.FindOrRegisterForKey(InstanceKey)");
    expect(program).toContain("RedirectActivationToAsync(activationArgs)");
    const cfg = read("windows/DibayDesktop/AppConfig.cs");
    expect(cfg).toContain('uri.Host.EndsWith(".supabase.co", StringComparison.OrdinalIgnoreCase)');
    expect(cfg).toContain('uri.AbsolutePath.StartsWith("/auth/v1/authorize", StringComparison.Ordinal)');
    const win = read("windows/DibayDesktop/MainWindow.xaml.cs");
    expect(win).toMatch(/if \(type == "auth\.open"\)[\s\S]{0,400}AppConfig\.IsAuthOpenAllowed\(authUri\)/);
    expect(win).toMatch(/_pendingAuthReturn = null;\s*core\.PostWebMessageAsJson/);
    const app = read("windows/DibayDesktop/App.xaml.cs");
    expect(app).toContain("AppConfig.IsAuthReturnUri(uri)");
  });
});
