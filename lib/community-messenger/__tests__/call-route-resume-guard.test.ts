import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveCallRouteResumeDecision } from "@/lib/community-messenger/call-route-resume-guard";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function mockSession(overrides: Partial<CommunityMessengerCallSession>): CommunityMessengerCallSession {
  return {
    roomId: "room-1",
    peerUserId: "peer-1",
    peerLabel: "Peer",
    callKind: "voice",
    status: "ringing",
    sessionMode: "direct",
    isMineInitiator: false,
    createdAt: new Date().toISOString(),
    id: "s-default",
    ...overrides,
  } as CommunityMessengerCallSession;
}

describe("call-route-resume-guard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/sessions/s-outgoing")) {
          return new Response(
            JSON.stringify({
              ok: true,
              session: mockSession({ id: "s-outgoing", isMineInitiator: true, status: "ringing" }),
            }),
            { status: 200 }
          );
        }
        if (url.includes("/sessions/s-active")) {
          return new Response(
            JSON.stringify({
              ok: true,
              session: mockSession({ id: "s-active", isMineInitiator: true, status: "active" }),
            }),
            { status: 200 }
          );
        }
        if (url.includes("/sessions/s-ended")) {
          return new Response(
            JSON.stringify({
              ok: true,
              session: mockSession({ id: "s-ended", status: "ended" }),
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ ok: false }), { status: 404 });
      })
    );
    vi.stubGlobal(
      "sessionStorage",
      {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks stale outgoing ringing on native resume replay", async () => {
    const decision = await resolveCallRouteResumeDecision({
      sessionId: "s-outgoing",
      path: "/community-messenger/calls/s-outgoing?source=native_resume",
    });
    expect(decision.action).toBe("block");
    if (decision.action === "block") {
      expect(decision.reason).toBe("stale_outgoing_ringing");
    }
  });

  it("allows active session native resume", async () => {
    const decision = await resolveCallRouteResumeDecision({
      sessionId: "s-active",
      path: "/community-messenger/calls/s-active?source=native_resume",
    });
    expect(decision.action).toBe("allow");
  });

  it("blocks terminal session replay", async () => {
    const decision = await resolveCallRouteResumeDecision({
      sessionId: "s-ended",
      path: "/community-messenger/calls/s-ended?source=native_resume",
    });
    expect(decision.action).toBe("block");
    if (decision.action === "block") {
      expect(decision.reason).toBe("terminal_session");
    }
  });

  it("blocks tmp outgoing shell replay", async () => {
    const decision = await resolveCallRouteResumeDecision({
      sessionId: "tmp_test123",
      path: "/community-messenger/calls/tmp_test123?kind=voice",
    });
    expect(decision.action).toBe("block");
    if (decision.action === "block") {
      expect(decision.reason).toBe("temp_outgoing_shell");
    }
  });
});
