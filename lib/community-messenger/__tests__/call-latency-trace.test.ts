import { describe, expect, it, vi } from "vitest";
import {
  logCallLatencyCallScreenPainted,
  logCallLatencyCmInviteRingEmit,
  logCallLatencyCmInviteRingReceived,
  logCallLatencyDialClick,
  logCallLatencyMediaCleanupDone,
  logCallLatencyMediaCleanupStart,
  logCallLatencyRouteReplace,
  logCallLatencySessionCreated,
  logCallLatencyTerminalCleanupDone,
  logCallMediaOutgoingVideoGumDeferred,
  resetCallLatencyTraceStateForTests,
} from "@/lib/community-messenger/call-latency-trace";

describe("call-latency-trace", () => {
  it("emits P1-1 latency markers with sinceClick after dial_click", () => {
    resetCallLatencyTraceStateForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logCallLatencyDialClick({ callKind: "voice" });
    logCallLatencyRouteReplace({ sessionId: "tmp_1" });
    logCallLatencyCallScreenPainted({ sessionId: "tmp_1" });
    logCallMediaOutgoingVideoGumDeferred({ phase: "outgoing_dial" });

    expect(infoSpy).toHaveBeenCalledWith("[call-latency] dial_click", expect.any(Object));
    expect(infoSpy).toHaveBeenCalledWith("[call-latency] route_replace", expect.any(Object));
    expect(infoSpy).toHaveBeenCalledWith("[call-latency] call_screen_painted", expect.any(Object));
    expect(infoSpy).toHaveBeenCalledWith("[call-media] outgoing_video_gum_deferred", expect.any(Object));

    const routePayload = infoSpy.mock.calls.find((c) => c[0] === "[call-latency] route_replace")?.[1] as {
      sinceClick?: number;
    };
    expect(typeof routePayload.sinceClick).toBe("number");

    infoSpy.mockRestore();
  });

  it("marks post_terminal dial_path after terminal_cleanup_done", () => {
    resetCallLatencyTraceStateForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logCallLatencyTerminalCleanupDone({ sessionId: "call-1" });
    logCallLatencyDialClick({ callKind: "voice" });

    const dialPayload = infoSpy.mock.calls.find((c) => c[0] === "[call-latency] dial_click")?.[1] as {
      dial_path?: string;
      sinceTerminalCleanup?: number;
    };
    expect(dialPayload.dial_path).toBe("post_terminal");
    expect(typeof dialPayload.sinceTerminalCleanup).toBe("number");

    infoSpy.mockRestore();
  });

  it("chains session_created and cm_invite_ring emit with sinceClick", () => {
    resetCallLatencyTraceStateForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logCallLatencyDialClick({ callKind: "video" });
    logCallLatencyRouteReplace({ sessionId: "tmp_2" });
    logCallLatencySessionCreated({ sessionId: "real-2", roomId: "room-1" });
    logCallLatencyCmInviteRingEmit({ sessionId: "real-2", roomId: "room-1", callKind: "video" });

    const createdPayload = infoSpy.mock.calls.find((c) => c[0] === "[call-latency] session_created")?.[1] as {
      sinceClick?: number;
      sinceRouteReplace?: number;
    };
    const ringPayload = infoSpy.mock.calls.find(
      (c) => c[0] === "[call-latency] cm_invite_ring" && (c[1] as { phase?: string }).phase === "emit"
    )?.[1] as { sinceSessionCreated?: number; sinceClick?: number };

    expect(typeof createdPayload.sinceClick).toBe("number");
    expect(typeof createdPayload.sinceRouteReplace).toBe("number");
    expect(typeof ringPayload.sinceSessionCreated).toBe("number");
    expect(typeof ringPayload.sinceClick).toBe("number");

    infoSpy.mockRestore();
  });

  it("logs media cleanup duration", () => {
    resetCallLatencyTraceStateForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logCallLatencyMediaCleanupStart({ sessionId: "call-3" });
    logCallLatencyMediaCleanupDone({ sessionId: "call-3" });

    const donePayload = infoSpy.mock.calls.find((c) => c[0] === "[call-latency] media_cleanup_done")?.[1] as {
      sinceCleanupStart?: number;
    };
    expect(typeof donePayload.sinceCleanupStart).toBe("number");

    infoSpy.mockRestore();
  });

  it("logs callee cm_invite_ring received", () => {
    resetCallLatencyTraceStateForTests();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logCallLatencyCmInviteRingReceived({ sessionId: "call-4", source: "broadcast_ring" });

    expect(infoSpy).toHaveBeenCalledWith(
      "[call-latency] cm_invite_ring",
      expect.objectContaining({ role: "recipient", phase: "received", sessionId: "call-4" })
    );

    infoSpy.mockRestore();
  });
});
