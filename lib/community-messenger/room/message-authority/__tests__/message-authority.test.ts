import { describe, expect, it, beforeEach } from "vitest";
import {
  authorityApplyCatchUp,
  authorityApplyOptimistic,
  authorityApplyRealtime,
  authorityConfirmOptimistic,
  authorityFailOptimistic,
  authorityGetMessages,
  authorityIsSeeded,
  authoritySeedBootstrap,
} from "@/lib/community-messenger/room/message-authority/message-authority";
import { resetRoomMessageStoreForTests } from "@/lib/community-messenger/room/message-authority/room-message-store";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

function msg(
  id: string,
  content: string,
  createdAt = "2026-01-01T00:00:00.000Z"
): CommunityMessengerMessage {
  return {
    id,
    roomId: "room-1",
    senderId: "u1",
    senderLabel: "U",
    messageType: "text",
    content,
    createdAt,
    isMine: true,
    callKind: null,
    callStatus: null,
  } as CommunityMessengerMessage;
}

describe("message authority contract", () => {
  beforeEach(() => {
    resetRoomMessageStoreForTests();
  });

  it("seedBootstrap only once when already seeded", () => {
    expect(authoritySeedBootstrap("room-1", [msg("a", "1")])).toBe(true);
    expect(authorityIsSeeded("room-1")).toBe(true);
    expect(authoritySeedBootstrap("room-1", [msg("b", "2"), msg("c", "3")])).toBe(false);
    expect(authorityGetMessages("room-1").map((m) => m.id)).toEqual(["a"]);
  });

  it("catch-up appends missing ids only", () => {
    authoritySeedBootstrap("room-1", [msg("a", "1")]);
    const n = authorityApplyCatchUp("room-1", [msg("a", "1-dup"), msg("b", "2"), msg("c", "3")]);
    expect(n).toBe(2);
    expect(authorityGetMessages("room-1").map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("realtime insert appends one; update does not duplicate", () => {
    authoritySeedBootstrap("room-1", [msg("a", "1")]);
    authorityApplyRealtime("room-1", { eventType: "INSERT", message: msg("b", "2", "2026-01-01T00:00:01.000Z") });
    authorityApplyRealtime("room-1", {
      eventType: "UPDATE",
      message: { ...msg("b", "2-edit", "2026-01-01T00:00:01.000Z") },
    });
    const list = authorityGetMessages("room-1");
    expect(list.map((m) => m.id)).toEqual(["a", "b"]);
    expect(list.find((m) => m.id === "b")?.content).toBe("2-edit");
  });

  it("optimistic then confirm replaces pending", () => {
    authorityApplyOptimistic("room-1", {
      ...msg("pending:1", "hi"),
      clientMessageId: "cid-1",
      pending: true,
    });
    expect(authorityGetMessages("room-1").some((m) => m.pending)).toBe(true);
    authorityConfirmOptimistic(
      "room-1",
      { ...msg("real-1", "hi", "2026-01-01T00:00:02.000Z"), clientMessageId: "cid-1" },
      "cid-1"
    );
    const list = authorityGetMessages("room-1");
    expect(list.some((m) => m.pending)).toBe(false);
    expect(list.some((m) => m.id === "real-1")).toBe(true);
  });

  it("failOptimistic removes temp id", () => {
    authorityApplyOptimistic("room-1", { ...msg("pending:x", "x"), pending: true });
    authorityFailOptimistic("room-1", "pending:x");
    expect(authorityGetMessages("room-1")).toEqual([]);
  });

  it("store has no full-replace public path — second seed ignored", () => {
    authoritySeedBootstrap("room-1", [msg("a", "1"), msg("b", "2")]);
    authorityApplyCatchUp("room-1", [msg("a", "overwrite")]);
    expect(authorityGetMessages("room-1").find((m) => m.id === "a")?.content).toBe("1");
  });
});
