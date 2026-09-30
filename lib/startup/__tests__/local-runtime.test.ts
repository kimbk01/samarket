import { describe, expect, it } from "vitest";
import {
  assertExclusiveStartupRuntimeMode,
  resolveStartupRuntimeMode,
} from "@/lib/startup/local-runtime-flag";
import {
  LocalRuntimeStateMachine,
  resolveLocalRuntimeAppReady,
  transitionLocalRuntimeState,
} from "@/lib/startup/local-runtime-state";
import { buildLocalRuntimeDocumentHtml } from "@/lib/startup/local-runtime-markup";

describe("local-runtime-flag", () => {
  it("defaults to legacy remote runtime", () => {
    expect(resolveStartupRuntimeMode({})).toEqual({
      localRuntime: false,
      legacyRemoteRuntime: true,
    });
  });

  it("enables local runtime from env", () => {
    expect(resolveStartupRuntimeMode({ dibayLocalRuntime: "1" })).toEqual({
      localRuntime: true,
      legacyRemoteRuntime: false,
    });
  });

  it("rejects simultaneous modes", () => {
    expect(() =>
      assertExclusiveStartupRuntimeMode({ localRuntime: true, legacyRemoteRuntime: true })
    ).toThrow(/exclusive/);
  });
});

describe("local-runtime-state", () => {
  it("advances one step and is idempotent", () => {
    const r1 = transitionLocalRuntimeState("NATIVE_LAUNCH", "LOCAL_RUNTIME_LOADING");
    expect(r1).toMatchObject({ ok: true, advanced: true });
    const r2 = transitionLocalRuntimeState("LOCAL_RUNTIME_LOADING", "LOCAL_RUNTIME_LOADING");
    expect(r2).toMatchObject({ ok: true, advanced: false });
  });

  it("rejects forbidden and rewind", () => {
    expect(transitionLocalRuntimeState("LOCAL_SHELL_READY", "BLANK").ok).toBe(false);
    expect(transitionLocalRuntimeState("APP_READY", "INTRO_VISIBLE").ok).toBe(false);
  });

  it("App Ready ignores remote data completeness", () => {
    expect(
      resolveLocalRuntimeAppReady({
        localRootMounted: true,
        localAppShellPaintReady: true,
        fatalStartupError: false,
      })
    ).toBe(true);
  });

  it("state machine reaches APP_READY without Intro states", () => {
    const sm = new LocalRuntimeStateMachine();
    const path = [
      "LOCAL_RUNTIME_LOADING",
      "LOCAL_RUNTIME_PAINTED",
      "LOCAL_SHELL_READY",
      "REMOTE_DATA_CONNECTING",
      "APP_READY",
    ] as const;
    for (const s of path) {
      expect(sm.transition(s).ok).toBe(true);
    }
    expect(sm.getState()).toBe("APP_READY");
  });
});

describe("local-runtime-markup", () => {
  it("builds document without Hybrid handoff / Cover / Intro", () => {
    const html = buildLocalRuntimeDocumentHtml({
      remoteApiOrigin: "https://samarket.vercel.app",
    });
    expect(html).toContain("__DIBAY_LOCAL_RUNTIME__");
    expect(html).toContain("data-local-runtime");
    expect(html).toContain("dibay-startup-nav");
    expect(html).not.toContain("beginHandoffCover");
    expect(html).not.toContain("__dibay-startup");
    expect(html).not.toContain("dibay-startup-intro");
    expect(html).not.toMatch(/STATES\s*=\s*\[[^\]]*INTRO_VISIBLE/);
    expect(html).not.toMatch(/location\.replace\s*\(\s*url\s*\)/);
  });
});
