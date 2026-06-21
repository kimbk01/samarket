import { describe, expect, it } from "vitest";
import {
  buildForegroundIncomingWakeOptimisticSession,
  mergeForegroundIncomingWakeSession,
} from "@/lib/community-messenger/incoming-call/foreground-incoming-wake";

describe("foreground-incoming-wake", () => {
  it("builds optimistic ringing row with initiator as peerUserId hint", () => {
    const optimistic = buildForegroundIncomingWakeOptimisticSession(
      "self",
      {
        sessionId: "call-b",
        roomId: "room-1",
        callKind: "voice",
        callerId: "caller",
      },
      new Map()
    );

    expect(optimistic?.id).toBe("call-b");
    expect(optimistic?.status).toBe("ringing");
    expect(optimistic?.source).toBe("fcm_wake");
    expect(optimistic?.initiatorUserId).toBe("caller");
    expect(optimistic?.peerUserId).toBe("caller");
    expect(optimistic?.peerLabel).toBe("");
  });

  it("builds optimistic ringing row before async native consumed check", () => {
    const optimistic = buildForegroundIncomingWakeOptimisticSession(
      "self",
      {
        sessionId: "call-b",
        roomId: "room-1",
        callKind: "voice",
        callerId: "caller",
      },
      new Map()
    );

    expect(optimistic?.id).toBe("call-b");
    expect(optimistic?.status).toBe("ringing");
    expect(optimistic?.source).toBe("fcm_wake");
  });

  it("prepends optimistic session to incoming list", () => {
    const optimistic = buildForegroundIncomingWakeOptimisticSession(
      "self",
      {
        sessionId: "call-b",
        roomId: "room-1",
        callKind: "voice",
        callerId: "caller",
      },
      new Map()
    );
    expect(optimistic).not.toBeNull();
    const next = mergeForegroundIncomingWakeSession(
      [
        {
          ...optimistic!,
          id: "call-a",
        },
      ],
      optimistic!
    );
    expect(next[0]?.id).toBe("call-b");
  });
});
