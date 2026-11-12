// @vitest-environment jsdom
/**
 * C2 — OS 시작 화면 해제 주체 누락 0 (docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4 C2 · R1-e).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isSplashAuthShellFallbackPath, tryDismissNativeSplash } from "@/lib/startup/startup-metrics";

const APP_DIR = path.resolve(process.cwd(), "app");

/** app/ 최상위 페이지 세그먼트 (API·내부 폴더·라우트 그룹 제외). */
function topLevelPageSegments(): string[] {
  return readdirSync(APP_DIR).filter((name) => {
    if (name === "api" || name.startsWith("_") || name.startsWith("(")) return false;
    return statSync(path.join(APP_DIR, name)).isDirectory();
  });
}

describe("해제 주체 표", () => {
  it("(main) 밖 최상위 페이지 경로는 모두 auth-shell 해제 목록에 있다", () => {
    const segments = topLevelPageSegments();
    expect(segments.length).toBeGreaterThan(0);
    const uncovered = segments.filter((seg) => !isSplashAuthShellFallbackPath(`/${seg}`));
    expect(uncovered).toEqual([]);
  });

  it("(main) 은 ConditionalAppShell 이 해제한다", () => {
    expect(readFileSync("app/(main)/layout.tsx", "utf8")).toContain("MainAppProviders");
    expect(readFileSync("components/layout/ConditionalAppShell.tsx", "utf8")).toContain(
      "<MarkInitialDestinationVisualReadyOnce"
    );
  });

  it("루트 not-found · global-error · error 는 스스로 해제한다", () => {
    expect(readFileSync("components/app/NotFoundClient.tsx", "utf8")).toContain('tryDismissNativeSplash("not_found")');
    expect(readFileSync("app/global-error.tsx", "utf8")).toContain('tryDismissNativeSplash("global_error")');
    expect(readFileSync("app/error.tsx", "utf8")).toContain('tryDismissNativeSplash("error_boundary")');
  });
});

describe("tryDismissNativeSplash — 브리지 즉시 호출", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).DibayBootBridge;
  });

  it("동적 import 를 기다리지 않고 같은 호출 안에서 Android 브리지를 부른다", () => {
    const dismissSplash = vi.fn();
    (window as unknown as Record<string, unknown>).DibayBootBridge = { dismissSplash };
    tryDismissNativeSplash("test_sync");
    expect(dismissSplash).toHaveBeenCalledTimes(1);
  });

  it("브리지 호출은 소스상 `await import(\"@capacitor/core\")` 보다 앞에 있다", () => {
    const src = readFileSync("lib/startup/startup-metrics.ts", "utf8");
    /** P3 (2026-11-12): 브리지 호출은 `dismissNativeSplashBridges` 로 분리 — `tryDismissNativeSplash` 가 동기로 부른다 */
    const tryStart = src.indexOf("export function tryDismissNativeSplash");
    const tryBody = src.slice(tryStart, src.indexOf("\n}\n", tryStart));
    expect(tryBody).toContain("dismissNativeSplashBridges(reason);");
    expect(tryBody).not.toContain("await ");
    const fnStart = src.indexOf("function dismissNativeSplashBridges");
    const body = src.slice(fnStart, src.indexOf("\nfunction ", fnStart + 1));
    const bridgeAt = body.indexOf("bridge.dismissSplash()");
    const importAt = body.indexOf('await import("@capacitor/core")');
    expect(bridgeAt).toBeGreaterThan(0);
    expect(importAt).toBeGreaterThan(bridgeAt);
    expect(body).not.toContain("setTimeout");
  });
});
