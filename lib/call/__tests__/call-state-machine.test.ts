import { describe, expect, it } from "vitest";
import type { CallContext } from "@/lib/call/call-types";
import { INITIAL_CALL_CONTEXT } from "@/lib/call/call-types";
import {
  shouldIgnoreSessionRefreshDowngrade,
  transitionCallState,
} from "@/lib/call/call-state-machine";

const baseOutgoing: CallContext = {
  ...INITIAL_CALL_CONTEXT,
  state: "outgoing",
  sessionId: "sess-1",
  roomId: "room-1",
  role: "caller",
  kind: "voice",
  peerUserId: "peer-1",
  peerLabel: "Peer",
};

describe("call-state-machine", () => {
  it("idle → incoming on CALL_INCOMING", () => {
    const r = transitionCallState(INITIAL_CALL_CONTEXT, {
      type: "CALL_INCOMING",
      payload: {
        sessionId: "s1",
        roomId: "r1",
        callKind: "voice",
        peerUserId: "u1",
        peerLabel: "Alice",
      },
    });
    expect(r.ctx.state).toBe("incoming");
    expect(r.effects.some((e) => e.type === "START_RING")).toBe(true);
  });

  it("ignores stale sessionId remote_end", () => {
    const r = transitionCallState(baseOutgoing, {
      type: "CALL_REMOTE_ENDED",
      payload: { sessionId: "other", senderId: "peer-1", reason: "end" },
    });
    expect(r.ignored).toBe(true);
  });

  it("ignores remote_end without senderId", () => {
    const ctx = { ...baseOutgoing, state: "active" as const };
    const r = transitionCallState(ctx, {
      type: "CALL_REMOTE_ENDED",
      payload: { sessionId: "sess-1", senderId: null, reason: "ended" },
    });
    expect(r.ignored).toBe(true);
  });

  it("active → ending on CALL_END_CLICK", () => {
    const ctx = { ...baseOutgoing, state: "active" as const };
    const r = transitionCallState(ctx, { type: "CALL_END_CLICK" });
    expect(r.ctx.state).toBe("ending");
    expect(r.effects.some((e) => e.type === "PATCH_END")).toBe(true);
  });

  it("CALL_DIAL_FAILED → failed", () => {
    const dialing: CallContext = { ...baseOutgoing, state: "outgoing", sessionId: null };
    const r = transitionCallState(dialing, { type: "CALL_DIAL_FAILED" });
    expect(r.ctx.state).toBe("failed");
  });

  it("CALL_JOIN_FAILED → failed from connecting", () => {
    const ctx = { ...baseOutgoing, state: "connecting" as const };
    const r = transitionCallState(ctx, { type: "CALL_JOIN_FAILED" });
    expect(r.ctx.state).toBe("failed");
  });

  it("CALL_CLEANUP_DONE resets to idle from ended", () => {
    const ctx = { ...baseOutgoing, state: "ended" as const };
    const r = transitionCallState(ctx, { type: "CALL_CLEANUP_DONE" });
    expect(r.ctx.state).toBe("idle");
  });

  it("refresh blocks active→ended downgrade", () => {
    const ctx = { ...baseOutgoing, state: "active" as const };
    expect(shouldIgnoreSessionRefreshDowngrade(ctx, "ended")).toBe(true);
    expect(shouldIgnoreSessionRefreshDowngrade(ctx, "active")).toBe(false);
  });

  it("fresh dial from ended terminal", () => {
    const ended: CallContext = { ...baseOutgoing, state: "ended", sessionId: "sess-old" };
    const r = transitionCallState(ended, {
      type: "CALL_DIAL_START",
      payload: { roomId: "room-1", callKind: "voice", peerUserId: "peer-1" },
    });
    expect(r.ctx.state).toBe("outgoing");
    expect(r.ctx.sessionId).toBeNull();
  });
});
