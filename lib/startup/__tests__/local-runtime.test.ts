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
  it("defaults to local runtime (product cutover)", () => {
    expect(resolveStartupRuntimeMode({})).toEqual({
      localRuntime: true,
      legacyRemoteRuntime: false,
    });
  });

  it("enables legacy only when forced off", () => {
    expect(resolveStartupRuntimeMode({ dibayLocalRuntime: "0" })).toEqual({
      localRuntime: false,
      legacyRemoteRuntime: true,
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
    expect(transitionLocalRuntimeState("INTRO_VISIBLE", "BLANK").ok).toBe(false);
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

  it("state machine reaches REMOTE_DATA_SYNC", () => {
    const sm = new LocalRuntimeStateMachine();
    const path = [
      "LOCAL_RUNTIME_LOADING",
      "LOCAL_RUNTIME_PAINTED",
      "INTRO_VISIBLE",
      "LOCAL_SHELL_READY",
      "SESSION_RESTORING",
      "APP_READY",
      "INTRO_REMOVED",
      "REMOTE_DATA_SYNC",
    ] as const;
    for (const s of path) {
      expect(sm.transition(s).ok).toBe(true);
    }
    expect(sm.getState()).toBe("REMOTE_DATA_SYNC");
  });
});

describe("local-runtime-markup", () => {
  it("builds document without Hybrid handoff / Cover", () => {
    const html = buildLocalRuntimeDocumentHtml({
      remoteApiOrigin: "https://samarket.vercel.app",
      logoSrc: "data:image/png;base64,xx",
    });
    expect(html).toContain("__DIBAY_LOCAL_RUNTIME__");
    expect(html).toContain("data-local-runtime");
    expect(html).toContain("local-runtime-app.js");
    expect(html).not.toContain("beginHandoffCover");
    expect(html).not.toContain("__dibay-startup");
  });
});
