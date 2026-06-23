import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCallV3ScreenHref,
  buildCallV3FallbackScreenHref,
  routeBackFromCallV3,
  routeToCallV3Screen,
  takeCallV3ReturnPath,
} from "@/lib/community-messenger/call-v3/call-v3-route";
import { buildCallV3ScreenViewModel, mapCallV3PhaseToCallPhase } from "@/lib/community-messenger/call-v3/call-v3-view-model";
import { vi } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("call-v3-route", () => {
  it("builds primary calls href", () => {
    expect(buildCallV3ScreenHref("abc-123")).toBe("/community-messenger/calls/abc-123");
  });

  it("builds fallback calls-v3 href", () => {
    expect(buildCallV3FallbackScreenHref("abc-123")).toBe("/community-messenger/calls-v3/abc-123");
  });

  it("routes to primary calls screen", () => {
    const push = vi.fn();
    routeToCallV3Screen({ push }, "call-9");
    expect(push).toHaveBeenCalledWith("/community-messenger/calls/call-9");
  });

  it("returns to remembered path after cancel", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { pathname: "/community-messenger/calls/call-9", search: "", assign: vi.fn() },
    });
    vi.stubGlobal("sessionStorage", {
      setItem: (k: string, v: string) => storage.set(k, v),
      getItem: (k: string) => storage.get(k) ?? null,
      removeItem: (k: string) => storage.delete(k),
    });

    storage.set("samarket.cm.call_v3_return_path.v1", "/community-messenger/rooms/room-1");
    const replace = vi.fn();
    routeBackFromCallV3({ replace });
    expect(replace).toHaveBeenCalledWith("/community-messenger/rooms/room-1");
    expect(takeCallV3ReturnPath()).toBeNull();

    vi.unstubAllGlobals();
  });
});

describe("call-v3-view-model", () => {
  const identity = {
    callId: "call-1",
    roomId: "room-1",
    callerUserId: "a",
    calleeUserId: "b",
    direction: "outgoing" as const,
    mediaType: "audio" as const,
    createdAt: "2026-06-23T00:00:00.000Z",
    peerLabel: "Peer",
  };

  const safeT = (key: string, options?: { fallbackKo?: string; fallbackEn?: string }) =>
    options?.fallbackKo ?? key;
  const t = (key: string) => key;
  const router = { push: vi.fn(), replace: vi.fn() };

  it("maps V3 phases to call screen phases", () => {
    expect(mapCallV3PhaseToCallPhase("outgoing_ringing")).toBe("ringing");
    expect(mapCallV3PhaseToCallPhase("joining")).toBe("connecting");
    expect(mapCallV3PhaseToCallPhase("connected")).toBe("connected");
  });

  it("builds cancel action for outgoing ringing", () => {
    const vm = buildCallV3ScreenViewModel({
      callId: "call-1",
      phase: "outgoing_ringing",
      identity,
      connectedAt: null,
      safeT,
      t,
      router,
    });
    expect(vm?.phase).toBe("ringing");
    expect(vm?.visualTheme).toBe("starbucks");
    expect(vm?.primaryActions.some((a) => a.dataTestId === "call-v3-cancel-button")).toBe(true);
  });

  it("builds end action for connected", () => {
    const vm = buildCallV3ScreenViewModel({
      callId: "call-1",
      phase: "connected",
      identity,
      connectedAt: Date.now(),
      safeT,
      t,
      router,
    });
    expect(vm?.primaryActions.some((a) => a.dataTestId === "call-v3-end-button")).toBe(true);
  });
});

describe("call-v3-incoming-banner", () => {
  it("renders only for incoming_ringing incoming direction", () => {
    const banner = read("components/community-messenger/call-v3/CallV3IncomingBanner.tsx");
    expect(banner).toContain('phase === "incoming_ringing"');
    expect(banner).toContain('identity?.direction === "incoming"');
    expect(banner).toContain("shouldSuppressCallV3WebIncomingBanner");
    expect(banner).toContain("call-v3-incoming-banner");
    expect(banner).toContain("callV3Accept");
    expect(banner).toContain("callV3Reject");
    expect(banner).toContain("incoming_banner_show");
    expect(banner).toContain("IncomingCallBanner");
  });

  it("exposes banner test id for QA", () => {
    const banner = read("components/community-messenger/call-v3/CallV3IncomingBanner.tsx");
    expect(banner).toContain('bannerDataTestId="call-v3-incoming-banner"');
    expect(banner).toContain('acceptDataTestId="call-v3-incoming-accept"');
    expect(banner).toContain('rejectDataTestId="call-v3-incoming-reject"');
  });
});

describe("call-v3-screen-ui", () => {
  it("reuses legacy CallScreen with V3 view model", () => {
    const screen = read("components/community-messenger/call-v3/CallV3Screen.tsx");
    expect(screen).toContain("CallScreen");
    expect(screen).toContain("buildCallV3ScreenViewModel");
    expect(screen).toContain('variant="page"');
    expect(screen).not.toContain("CallV3Controls");
  });

  it("primary call route mounts V3 adapter when flag enabled", () => {
    const page = read("app/(main)/community-messenger/calls/[sessionId]/page.tsx");
    expect(page).toContain("isDibayCallV3SafeLaneEnabled");
    expect(page).toContain("CallV3ScreenLazy");
  });
});
