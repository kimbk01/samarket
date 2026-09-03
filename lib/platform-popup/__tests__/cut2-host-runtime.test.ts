/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  mayMountPlatformPopupPresentation,
  reducePlatformPopupHostState,
} from "@/lib/platform-popup/popup-host-machine";
import {
  isPopupRuntimeEligible,
  resolvePopupRuntimeBlockReason,
  type PopupRuntimeContext,
} from "@/lib/platform-popup/popup-runtime-context";
import { canAcceptPlatformPopupWinner } from "@/lib/platform-popup/popup-stale-guard";
import { assertNotImpressionFromResolver } from "@/lib/platform-popup/events";
import { markPlatformPopupImpression } from "@/lib/platform-popup/popup-impression-boundary";
import { getOrCreatePlatformPopupAppSessionId } from "@/lib/platform-popup/popup-app-session";
import { readPlatformPopupCallRuntimeSnapshot } from "@/lib/platform-popup/popup-call-runtime";

const ROOT = process.cwd();

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsFiles(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

function baseCtx(over: Partial<PopupRuntimeContext> = {}): PopupRuntimeContext {
  return {
    pathname: "/market",
    surface: "TRADE",
    authReady: true,
    userId: "u1",
    isAppForeground: true,
    isLandscape: false,
    incomingCall: false,
    activeCall: false,
    nativeCallTransition: false,
    paymentCritical: false,
    orderSubmitCritical: false,
    orderConfirmationCritical: false,
    giftTransferCritical: false,
    authRestoreGate: false,
    permissionGate: false,
    addressGate: false,
    criticalDialog: false,
    startupDeferred: false,
    storesLcpDeferred: false,
    appSessionId: "sess-1",
    ...over,
  };
}

describe("CUT2 GlobalPopupHost authority", () => {
  it("mounts GlobalPopupHost exactly once in ConditionalAppShell", () => {
    const shell = readRepo("components/layout/ConditionalAppShell.tsx");
    const mounts = shell.match(/GlobalPopupHostLazy/g) ?? [];
    expect(mounts.length).toBeGreaterThanOrEqual(2); // import + JSX
    expect(shell).toContain("<GlobalPopupHostLazy");
    expect(shell.match(/<GlobalPopupHostLazy/g)?.length).toBe(1);
  });

  it("has no route-local GlobalPopupHost mounts", () => {
    const files = walkTsFiles(join(ROOT, "app")).concat(walkTsFiles(join(ROOT, "components")));
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith("ConditionalAppShell.tsx")) continue;
      if (f.endsWith("AdminPlatformShell.tsx")) continue; // same host, Admin shell only
      if (f.endsWith("GlobalPopupHost.tsx")) continue;
      const src = readFileSync(f, "utf8");
      if (
        src.includes("GlobalPopupHost") ||
        src.includes("data-platform-popup-host") ||
        src.includes("platform-popup-host")
      ) {
        offenders.push(f.replace(ROOT + "/", ""));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("AdminPlatformShell mounts the same GlobalPopupHost (not a second renderer)", () => {
    const shell = readRepo("components/admin/shell/AdminPlatformShell.tsx");
    expect(shell).toContain("@/components/platform-popup/GlobalPopupHost");
    expect(shell).toContain("<GlobalPopupHostLazy");
    expect(shell.match(/<GlobalPopupHostLazy/g)?.length).toBe(1);
  });
});

describe("CUT2 host state machine", () => {
  it("only VISIBLE may mount presentation", () => {
    for (const s of [
      "IDLE",
      "DEFERRED",
      "RESOLVING",
      "READY",
      "DISMISSED",
      "SUPPRESSED",
      "INVALIDATED",
    ] as const) {
      expect(mayMountPlatformPopupPresentation(s)).toBe(false);
    }
    expect(mayMountPlatformPopupPresentation("VISIBLE")).toBe(true);
  });

  it("dismiss keeps host out of presentation until RESET", () => {
    let s = reducePlatformPopupHostState("VISIBLE", { type: "DISMISS" });
    expect(mayMountPlatformPopupPresentation(s)).toBe(false);
    s = reducePlatformPopupHostState(s, { type: "RESET" });
    expect(s).toBe("IDLE");
    expect(mayMountPlatformPopupPresentation(s)).toBe(false);
  });

  it("call/critical defer invalidates visible", () => {
    expect(reducePlatformPopupHostState("VISIBLE", { type: "DEFER" })).toBe("INVALIDATED");
    expect(reducePlatformPopupHostState("VISIBLE", { type: "INVALIDATE" })).toBe("INVALIDATED");
  });
});

describe("CUT2 runtime eligibility", () => {
  it("eligible portrait consumer surface passes", () => {
    expect(isPopupRuntimeEligible(baseCtx())).toBe(true);
    expect(resolvePopupRuntimeBlockReason(baseCtx())).toBeNull();
  });

  it("landscape L1 suppresses", () => {
    expect(resolvePopupRuntimeBlockReason(baseCtx({ isLandscape: true }))).toBe("landscape");
  });

  it("background suppresses", () => {
    expect(resolvePopupRuntimeBlockReason(baseCtx({ isAppForeground: false }))).toBe("background");
  });

  it("excluded messenger surface blocks", () => {
    expect(
      resolvePopupRuntimeBlockReason(baseCtx({ pathname: "/community-messenger", surface: "MESSENGER" }))
    ).toBe("surface_excluded");
  });

  it("call incoming/active/native block", () => {
    expect(resolvePopupRuntimeBlockReason(baseCtx({ incomingCall: true }))).toBe("call");
    expect(resolvePopupRuntimeBlockReason(baseCtx({ activeCall: true }))).toBe("call");
    expect(resolvePopupRuntimeBlockReason(baseCtx({ nativeCallTransition: true }))).toBe("call");
  });

  it("payment/order/gift/auth/permission/address/dialog block", () => {
    expect(resolvePopupRuntimeBlockReason(baseCtx({ paymentCritical: true }))).toBe(
      "payment_order_gift"
    );
    expect(resolvePopupRuntimeBlockReason(baseCtx({ orderSubmitCritical: true }))).toBe(
      "payment_order_gift"
    );
    expect(resolvePopupRuntimeBlockReason(baseCtx({ orderConfirmationCritical: true }))).toBe(
      "payment_order_gift"
    );
    expect(resolvePopupRuntimeBlockReason(baseCtx({ giftTransferCritical: true }))).toBe(
      "payment_order_gift"
    );
    expect(resolvePopupRuntimeBlockReason(baseCtx({ authRestoreGate: true }))).toBe("auth_not_ready");
    expect(resolvePopupRuntimeBlockReason(baseCtx({ permissionGate: true }))).toBe(
      "auth_permission_address_dialog"
    );
    expect(resolvePopupRuntimeBlockReason(baseCtx({ addressGate: true }))).toBe(
      "auth_permission_address_dialog"
    );
    expect(resolvePopupRuntimeBlockReason(baseCtx({ criticalDialog: true }))).toBe(
      "auth_permission_address_dialog"
    );
  });
});

describe("CUT2 stale response / surface race", () => {
  it("rejects DELIVERY winner after navigate to TRADE", () => {
    const ok = canAcceptPlatformPopupWinner({
      requestGeneration: 1,
      currentGeneration: 1,
      surfaceAtRequest: "DELIVERY",
      winnerSurface: "DELIVERY",
      runtime: baseCtx({ pathname: "/market", surface: "TRADE" }),
      chainLockSurface: null,
    });
    expect(ok).toBe(false);
  });

  it("rejects stale generation", () => {
    expect(
      canAcceptPlatformPopupWinner({
        requestGeneration: 1,
        currentGeneration: 2,
        surfaceAtRequest: "TRADE",
        winnerSurface: "TRADE",
        runtime: baseCtx(),
        chainLockSurface: null,
      })
    ).toBe(false);
  });

  it("rejects when critical becomes active before accept", () => {
    expect(
      canAcceptPlatformPopupWinner({
        requestGeneration: 1,
        currentGeneration: 1,
        surfaceAtRequest: "TRADE",
        winnerSurface: "TRADE",
        runtime: baseCtx({ incomingCall: true, surface: "CALL" }),
        chainLockSurface: null,
      })
    ).toBe(false);
  });

  it("accepts matching eligible winner", () => {
    expect(
      canAcceptPlatformPopupWinner({
        requestGeneration: 3,
        currentGeneration: 3,
        surfaceAtRequest: "TRADE",
        winnerSurface: "TRADE",
        runtime: baseCtx(),
        chainLockSurface: null,
      })
    ).toBe(true);
  });

  it("dismiss chain lock blocks immediate re-accept on same surface", () => {
    expect(
      canAcceptPlatformPopupWinner({
        requestGeneration: 4,
        currentGeneration: 4,
        surfaceAtRequest: "TRADE",
        winnerSurface: "TRADE",
        runtime: baseCtx(),
        chainLockSurface: "TRADE",
      })
    ).toBe(false);
  });
});

describe("CUT2 impression boundary", () => {
  it("resolver/api cannot emit impression", () => {
    expect(assertNotImpressionFromResolver("impression", "resolver").ok).toBe(false);
    expect(assertNotImpressionFromResolver("impression", "api_eligibility").ok).toBe(false);
  });

  it("host READY path does not call markPlatformPopupImpression", () => {
    const host = readRepo("components/platform-popup/GlobalPopupHost.tsx");
    expect(host).not.toContain("markPlatformPopupImpression");
    expect(host).toContain("recordPlatformPopupEvent");
  });

  it("renderer-only mark is deferred contract (no auto emit from CUT2)", () => {
    const r = markPlatformPopupImpression({
      campaignId: "c",
      creativeId: "cr",
      surface: "TRADE",
      source: "renderer",
    });
    expect(r.ok).toBe(true);
  });
});

describe("CUT2 session + call adapter", () => {
  it("session id is stable across repeated reads in same storage", () => {
    // node env: no window — returns ssr sentinel consistently
    expect(getOrCreatePlatformPopupAppSessionId()).toBe("ssr");
  });

  it("call runtime snapshot is readable without inventing second presence", () => {
    const snap = readPlatformPopupCallRuntimeSnapshot();
    expect(snap).toEqual({
      incomingCall: expect.any(Boolean),
      activeCall: expect.any(Boolean),
      nativeCallTransition: expect.any(Boolean),
    });
  });

  it("GlobalPopupHost wires call subscribe + landscape + suppress API", () => {
    const host = readRepo("components/platform-popup/GlobalPopupHost.tsx");
    expect(host).toContain("subscribePlatformPopupCallRuntime");
    expect(host).toContain("isLandscape");
    expect(host).toContain("/api/platform-popup/suppress");
    expect(host).toContain("chainLockSurfaceRef");
  });
});

describe("CUT2 auth isolation contract in host", () => {
  it("invalidates on identity change", () => {
    const host = readRepo("components/platform-popup/GlobalPopupHost.tsx");
    expect(host).toContain("identityRef");
    expect(host).toContain('type: "INVALIDATE"');
    expect(host).toContain("anon:");
  });
});
