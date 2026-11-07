// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DIBAY_WINDOWS_SHELL_BRIDGE_VERSION,
  isDibayWindowsShell,
  parseDibayWindowsShellAppInfo,
  readDibayHostShellAttr,
  requestDibayWindowsShellAppInfo,
} from "@/lib/platform/dibay-windows-shell";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

type Listener = (event: { data: unknown }) => void;

function installFakeWebView2(reply?: (msg: unknown, emit: (data: unknown) => void) => void) {
  const listeners = new Set<Listener>();
  const emit = (data: unknown) => listeners.forEach((l) => l({ data }));
  const webview = {
    postMessage: vi.fn((msg: unknown) => reply?.(msg, emit)),
    addEventListener: (_t: "message", l: Listener) => listeners.add(l),
    removeEventListener: (_t: "message", l: Listener) => listeners.delete(l),
  };
  (window as unknown as { chrome?: unknown }).chrome = { webview };
  return { webview, listeners };
}

/**
 * Windows 셸 W0 (2026-11-07 설계 · Owner 「W0 진행」) — 동작 변화 0.
 * 기존 Android·iOS 판정은 그대로, Windows 셸은 별도 함수로만 알아본다.
 */
describe("Windows shell W0", () => {
  afterEach(() => {
    delete (window as unknown as { chrome?: unknown }).chrome;
  });

  it("browser (no chrome.webview) → not a Windows shell", () => {
    expect(isDibayWindowsShell()).toBe(false);
    expect(readDibayHostShellAttr()).toBe("");
  });

  it("WebView2 host (chrome.webview) → Windows shell", () => {
    installFakeWebView2();
    expect(isDibayWindowsShell()).toBe(true);
    expect(readDibayHostShellAttr()).toBe("windows");
  });

  it("existing Android/iOS detection is unchanged — WebView2 is NOT a Capacitor shell", () => {
    installFakeWebView2();
    expect(resolveCapacitorShellPlatform()).toBeNull();
    const src = read("lib/platform/capacitor-native.ts");
    expect(src).toContain('export type DibayAppPlatform = "android" | "ios";');
    expect(src).toContain('new Set<DibayAppPlatform>(["android", "ios"])');
    expect(src).not.toMatch(/windows/i);
  });

  it("app.info handshake — parses the shell reply", async () => {
    installFakeWebView2((msg, emit) => {
      expect(msg).toEqual({ type: "app.info", bridgeVersion: DIBAY_WINDOWS_SHELL_BRIDGE_VERSION });
      // WebView2 PostWebMessageAsJson → event.data 는 객체
      emit({ type: "app.info", shell: "windows", bridgeVersion: 1, appVersion: "0.1.0.0" });
    });
    await expect(requestDibayWindowsShellAppInfo(200)).resolves.toEqual({
      type: "app.info",
      shell: "windows",
      bridgeVersion: 1,
      appVersion: "0.1.0.0",
    });
  });

  it("no reply → null after timeout; not a shell → null immediately", async () => {
    installFakeWebView2();
    await expect(requestDibayWindowsShellAppInfo(20)).resolves.toBeNull();
    delete (window as unknown as { chrome?: unknown }).chrome;
    await expect(requestDibayWindowsShellAppInfo(20)).resolves.toBeNull();
  });

  it("parser rejects foreign / malformed messages", () => {
    expect(parseDibayWindowsShellAppInfo({ type: "app.info", shell: "android", bridgeVersion: 1, appVersion: "1" })).toBeNull();
    expect(parseDibayWindowsShellAppInfo({ type: "other" })).toBeNull();
    expect(parseDibayWindowsShellAppInfo("not json")).toBeNull();
    expect(parseDibayWindowsShellAppInfo({ type: "app.info", shell: "windows", bridgeVersion: 0, appVersion: "1" })).toBeNull();
    expect(
      parseDibayWindowsShellAppInfo(JSON.stringify({ type: "app.info", shell: "windows", bridgeVersion: 2, appVersion: "1.0.0.0" }))
    ).toEqual({ type: "app.info", shell: "windows", bridgeVersion: 2, appVersion: "1.0.0.0" });
  });

  it("app shell exposes data-dibay-host-shell only (no behaviour branch); server snapshot is empty", () => {
    const src = read("components/layout/ConditionalAppShell.tsx");
    expect(src).toContain("data-dibay-host-shell={hostShell}");
    expect(src).toContain(
      "useSyncExternalStore(subscribeHostShellNoop, readDibayHostShellAttr, readHostShellServerSnapshot)"
    );
    expect(src).toMatch(/function readHostShellServerSnapshot\(\): "windows" \| "" \{\s*return "";/);
    // W0: 판정 결과로 분기하는 곳은 화면 속성 하나뿐
    expect(src.match(/hostShell/g)?.length).toBe(2);
  });

  it("shell bridge version matches the web constant; shell answers only app.info (W0 · W2 되돌림 2026-11-08)", () => {
    const cfg = read("windows/DibayDesktop/AppConfig.cs");
    expect(cfg).toContain(`public const int BridgeVersion = ${DIBAY_WINDOWS_SHELL_BRIDGE_VERSION};`);
    const win = read("windows/DibayDesktop/MainWindow.xaml.cs");
    expect(win).toContain('if (type == "app.info")');
    expect(win).not.toMatch(/type == "(auth\.open|push\.register)"/);
    expect(win).toContain("AppConfig.IsAppOrigin(source)");
  });

  it("package identity is the dev placeholder (real values only after Store name reservation)", () => {
    const manifest = read("windows/DibayDesktop/Package.appxmanifest");
    expect(manifest).toMatch(/<Identity Name="DibayDesktop\.Dev" Publisher="CN=DIBAY Dev" Version="\d+\.\d+\.\d+\.\d+" \/>/);
    expect(manifest).toContain("<DisplayName>DIBAY (dev)</DisplayName>");
  });

  it("windows/ sources never trigger a web production build", () => {
    expect(read("scripts/vercel-ignored-build-step.mjs")).toContain('"windows/",');
  });
});
