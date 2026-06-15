import { describe, expect, it } from "vitest";
import type { CallV3Context } from "@/lib/call-v3/call-v3-types";
import { INITIAL_CALL_V3_CONTEXT } from "@/lib/call-v3/call-v3-types";
import {
  shouldIgnoreSessionRefreshDowngrade,
  transitionCallState,
} from "@/lib/call-v3/call-v3-state-machine";

const baseOutgoing: CallV3Context = {
  ...INITIAL_CALL_V3_CONTEXT,
  state: "outgoing",
  sessionId: "sess-1",
  roomId: "room-1",
  role: "caller",
  kind: "voice",
  peerUserId: "peer-1",
  peerLabel: "Peer",
};

describe("call-v3-state-machine", () => {
  it("idle → incoming on CALL_INCOMING", () => {
    const r = transitionCallState(INITIAL_CALL_V3_CONTEXT, {
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

  it("CALL_CLEANUP_DONE resets to idle from ended", () => {
    const ctx = { ...baseOutgoing, state: "ended" as const };
    const r = transitionCallState(ctx, { type: "CALL_CLEANUP_DONE" });
    expect(r.ctx.state).toBe("idle");
  });

  it("CALL_CLEANUP_DONE does not change active state", () => {
    const ctx = { ...baseOutgoing, state: "active" as const };
    const r = transitionCallState(ctx, { type: "CALL_CLEANUP_DONE" });
    expect(r.ignored).toBe(true);
  });

  it("refresh blocks active→ended downgrade", () => {
    const ctx = { ...baseOutgoing, state: "active" as const };
    expect(shouldIgnoreSessionRefreshDowngrade(ctx, "ended")).toBe(true);
    expect(shouldIgnoreSessionRefreshDowngrade(ctx, "active")).toBe(false);
  });

  it("fresh dial from idle", () => {
    const r = transitionCallState(INITIAL_CALL_V3_CONTEXT, {
      type: "CALL_DIAL_START",
      payload: { roomId: "r1", callKind: "video" },
    });
    expect(r.ctx.state).toBe("outgoing");
    expect(r.ctx.kind).toBe("video");
  });
});
