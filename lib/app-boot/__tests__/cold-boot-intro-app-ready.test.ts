/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cold-boot app-ready / intro hide contract.
 * DO NOT: min display timeout · multi-provider loading gate · route remount re-show.
 */

describe("dibay cold boot app-ready signal", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
  });

  it("marks app-ready once and hides intro DOM", async () => {
    document.body.innerHTML =
      '<div id="dibay-cold-boot-intro" data-dibay-cold-boot-intro="1"></div>';
    const mod = await import("@/lib/app-boot/dibay-boot-metrics");
    expect(mod.getAppReadySnapshot()).toBe(false);

    const calls: string[] = [];
    const unsub = mod.subscribeAppReady(() => {
      calls.push("ready");
    });

    mod.markAppReady("shellReady");
    mod.markAppReady("shellReady");
    mod.markAppReady("again");

    expect(mod.getAppReadySnapshot()).toBe(true);
    expect(calls).toEqual(["ready"]);
    const el = document.getElementById(mod.DIBAY_COLD_BOOT_INTRO_DOM_ID);
    expect(el?.hasAttribute("hidden")).toBe(true);
    expect(el?.getAttribute("data-ready")).toBe("1");
    unsub();
  });

  it("tryDismissNativeSplash marks app-ready idempotently", async () => {
    const mod = await import("@/lib/app-boot/dibay-boot-metrics");
    expect(mod.getAppReadySnapshot()).toBe(false);
    mod.tryDismissNativeSplash("shellReady");
    expect(mod.getAppReadySnapshot()).toBe(true);
    mod.tryDismissNativeSplash("shellReady");
    expect(mod.getAppReadySnapshot()).toBe(true);
  });

  it("shellReady marker does not re-fire after first mark", async () => {
    const mod = await import("@/lib/app-boot/dibay-boot-metrics");
    mod.markBootMetricsShellReady();
    const first = mod.getDibayBootMetrics().shellReady;
    mod.markBootMetricsShellReady();
    expect(mod.getDibayBootMetrics().shellReady).toBe(first);
    expect(mod.getAppReadySnapshot()).toBe(true);
  });
});

describe("forbidden cold-boot intro patterns", () => {
  it("intro controller source has no timed hide / reload / local state sync", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/app/DibayColdBootIntro.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(
      /\bsetTimeout\s*\(|minimumSplashDuration|router\.refresh|location\.reload|\buseState\s*\(/
    );
  });
});
