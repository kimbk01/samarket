import { describe, expect, it, vi } from "vitest";
import {
  completeDibayCallAction,
  deriveDibayCallOrchestratorState,
  endDibayCallAction,
  logDibayCall,
  markDibayCallTerminal,
  shouldAllowDibayCallRoute,
  tryBeginDibayCallAction,
} from "@/lib/community-messenger/call-orchestrator";

describe("call-orchestrator", () => {
  it("maps server session status into the six public states", () => {
    expect(deriveDibayCallOrchestratorState({ session: null })).toBe("IDLE");
    expect(deriveDibayCallOrchestratorState({ session: { status: "ringing" } })).toBe("RINGING");
    expect(deriveDibayCallOrchestratorState({ session: { status: "active" }, joined: false })).toBe("CONNECTING");
    expect(deriveDibayCallOrchestratorState({ session: { status: "active" }, joined: true })).toBe("CONNECTED");
    expect(deriveDibayCallOrchestratorState({ session: { status: "ended" } })).toBe("ENDED");
    expect(deriveDibayCallOrchestratorState({ session: { status: "active" }, ending: true })).toBe("ENDING");
  });

  it("allows only one action flight per session", () => {
    const sessionId = "orchestrator-action-session";
    expect(tryBeginDibayCallAction(sessionId, "accept")).toBe(true);
    expect(tryBeginDibayCallAction(sessionId, "accept")).toBe(false);
    expect(tryBeginDibayCallAction(sessionId, "reject")).toBe(false);
    endDibayCallAction(sessionId, "accept");
    expect(tryBeginDibayCallAction(sessionId, "reject")).toBe(true);
    completeDibayCallAction(sessionId, "reject");
  });

  it("blocks stale call routes after terminal state is latched", () => {
    const sessionId = "orchestrator-terminal-session";
    const path = `/community-messenger/calls/${sessionId}?action=accept`;
    expect(shouldAllowDibayCallRoute(path)).toBe(true);
    markDibayCallTerminal(sessionId);
    expect(shouldAllowDibayCallRoute(path)).toBe(false);
  });

  it("emits one log line per step and session", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal("window", {});
    try {
      const sessionId = "orchestrator-log-session";
      logDibayCall("accept_start", { sessionId, source: "activity" });
      logDibayCall("accept_start", { sessionId, source: "coordinator" });
      logDibayCall("incoming_render", { sessionId, source: "activity" });
      logDibayCall("incoming_render", { sessionId, source: "call_client" });

      expect(info.mock.calls.filter((call) => String(call[0]).includes("accept_start"))).toHaveLength(1);
      expect(info.mock.calls.filter((call) => String(call[0]).includes("incoming_render"))).toHaveLength(1);
    } finally {
      info.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
