/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const resolveCapacitorShellPlatform = vi.fn();

vi.mock("@/lib/platform/capacitor-native", () => ({
  resolveCapacitorShellPlatform: (...args: unknown[]) => resolveCapacitorShellPlatform(...args),
}));

describe("android-cookie-durability-contract", () => {
  const root = process.cwd();

  beforeEach(() => {
    resolveCapacitorShellPlatform.mockReset();
    delete (window as { DibayBootBridge?: unknown }).DibayBootBridge;
  });

  afterEach(() => {
    delete (window as { DibayBootBridge?: unknown }).DibayBootBridge;
  });

  it("forbids OEM/model branches, sleep, token storage, and Authority promotion", () => {
    const files = [
      "lib/auth/android-cookie-durability.client.ts",
      "lib/auth/completion/run-common-auth-client-completion.client.ts",
      "lib/auth/client-session-wipe.ts",
      "android/app/src/main/java/com/dibay/app/MainActivity.java",
    ];
    const forbidden = [
      /Samsung/i,
      /Xiaomi/i,
      /Build\.MODEL/,
      /setTimeout\s*\(/,
      /\bsleep\s*\(/,
      /localStorage\.setItem\s*\(\s*['"][^'"]*token/i,
      /getSharedPreferences\s*\(\s*["']auth/i,
    ];
    for (const rel of files) {
      const src = readFileSync(join(root, rel), "utf8");
      if (rel.endsWith("MainActivity.java")) {
        expect(src).toMatch(/flushAuthCookies/);
        expect(src).toMatch(/CookieManager\.getInstance\(\)\.flush\(\)/);
        expect(src).not.toMatch(/Build\.MODEL/);
        expect(src).not.toMatch(/Samsung|Xiaomi/i);
        const start = src.indexOf("public boolean flushAuthCookies()");
        expect(start).toBeGreaterThan(-1);
        const flushBlock = src.slice(start, start + 500);
        expect(flushBlock).not.toMatch(/SharedPreferences|getSharedPreferences/);
        expect(flushBlock).not.toMatch(/getCookie\(/);
        continue;
      }
      for (const re of forbidden) {
        expect(src, `${rel} matches ${re}`).not.toMatch(re);
      }
    }
  });

  it("login completion order: session prime → flush → navigation", () => {
    const src = readFileSync(
      join(root, "lib/auth/completion/run-common-auth-client-completion.client.ts"),
      "utf8",
    );
    const primeIdx = src.indexOf("primeClientAuthSessionFromSupabase");
    const syncIdx = src.indexOf("syncCommonClientSessionAfterAuth");
    const flushIdx = src.indexOf('flushAndroidAuthCookies("login_completion")');
    const navIdx = src.indexOf("navigation_committed");
    expect(flushIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(flushIdx);
    expect(Math.min(primeIdx, syncIdx)).toBeGreaterThan(-1);
    expect(flushIdx).toBeGreaterThan(Math.min(primeIdx, syncIdx));
    expect(src).toMatch(/cookieFlush === "flush_failed"/);
    expect(src).not.toMatch(/ProfileWriter|ensureAuthProfileForLogin|resolveCommonAuthDestination/);
  });

  it("logout wipe flushes after cookie-clear phase (signOut-then-wipe contract)", () => {
    const wipe = readFileSync(join(root, "lib/auth/client-session-wipe.ts"), "utf8");
    const logout = readFileSync(join(root, "lib/auth/explicit-logout-flow.ts"), "utf8");
    const runWipeStart = wipe.indexOf("async function runWipeClientSessionState");
    expect(runWipeStart).toBeGreaterThan(-1);
    const runWipe = wipe.slice(runWipeStart);
    const flushIdx = runWipe.indexOf('flushAndroidAuthCookies("logout_wipe")');
    const storesCallIdx = runWipe.indexOf("resetInMemoryClientStores()");
    expect(flushIdx).toBeGreaterThan(-1);
    expect(storesCallIdx).toBeGreaterThan(flushIdx);
    expect(logout.indexOf("signOut")).toBeGreaterThan(-1);
    expect(logout.indexOf("wipeClientSessionState")).toBeGreaterThan(logout.indexOf("signOut"));
  });

  it("wrapper returns not_android / bridge_unavailable / flushed / flush_failed", async () => {
    const { flushAndroidAuthCookies } = await import(
      "@/lib/auth/android-cookie-durability.client"
    );

    resolveCapacitorShellPlatform.mockReturnValue("ios");
    expect(await flushAndroidAuthCookies("login_completion")).toBe("not_android");

    resolveCapacitorShellPlatform.mockReturnValue(null);
    expect(await flushAndroidAuthCookies("login_completion")).toBe("not_android");

    resolveCapacitorShellPlatform.mockReturnValue("android");
    expect(await flushAndroidAuthCookies("login_completion")).toBe("bridge_unavailable");

    (window as { DibayBootBridge?: { flushAuthCookies: () => boolean } }).DibayBootBridge = {
      flushAuthCookies: () => true,
    };
    expect(await flushAndroidAuthCookies("login_completion")).toBe("flushed");

    (window as { DibayBootBridge?: { flushAuthCookies: () => boolean } }).DibayBootBridge = {
      flushAuthCookies: () => false,
    };
    expect(await flushAndroidAuthCookies("logout_wipe")).toBe("flush_failed");

    (window as { DibayBootBridge?: { flushAuthCookies: () => boolean } }).DibayBootBridge = {
      flushAuthCookies: () => {
        throw new Error("boom");
      },
    };
    expect(await flushAndroidAuthCookies("login_completion")).toBe("flush_failed");
  });

  it("does not modify Profile Writer / Destination / AppBoot / Provider routing sources", () => {
    const completion = readFileSync(
      join(root, "lib/auth/completion/run-common-auth-client-completion.client.ts"),
      "utf8",
    );
    expect(completion).not.toMatch(/resolve-common-auth-destination/);
    expect(completion).not.toMatch(/ensureAuthProfileForLogin/);
    expect(completion).not.toMatch(/AppBootProvider/);
    expect(completion).toMatch(/scheduleNonBlockingPostLoginWork/);
  });
});
