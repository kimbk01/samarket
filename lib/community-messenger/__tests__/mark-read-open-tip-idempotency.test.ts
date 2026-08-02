import { describe, expect, it } from "vitest";
import {
  buildCmMarkReadIdempotencyKey,
  buildSoMarkReadIdempotencyKey,
} from "@/lib/community-messenger/room-unread-authority-rpc";

describe("mark-read open/open_tail tip-scoped idempotency keys", () => {
  it("CM open_tail keys change when tip advances (read-clear after new messages)", () => {
    const before = buildCmMarkReadIdempotencyKey({
      userId: "u1",
      roomId: "r1",
      openTail: true,
      requestedLastReadMessageId: "",
      tipMessageId: "msg-old",
    });
    const after = buildCmMarkReadIdempotencyKey({
      userId: "u1",
      roomId: "r1",
      openTail: true,
      requestedLastReadMessageId: "",
      tipMessageId: "msg-new",
    });
    expect(before).toBe("cm_mark_read:u1:r1:open:msg-old");
    expect(after).toBe("cm_mark_read:u1:r1:open:msg-new");
    expect(before).not.toBe(after);
  });

  it("CM cursor keys stay tip-independent", () => {
    expect(
      buildCmMarkReadIdempotencyKey({
        userId: "u1",
        roomId: "r1",
        openTail: false,
        requestedLastReadMessageId: "msg-42",
        tipMessageId: "ignored",
      })
    ).toBe("cm_mark_read:u1:r1:msg-42");
  });

  it("SO open_tail keys change when tip advances", () => {
    const before = buildSoMarkReadIdempotencyKey({
      userId: "buyer",
      roomId: "so-room",
      role: "customer",
      throughMessageId: null,
      tipMessageId: "tip-1",
    });
    const after = buildSoMarkReadIdempotencyKey({
      userId: "buyer",
      roomId: "so-room",
      role: "customer",
      throughMessageId: null,
      tipMessageId: "tip-2",
    });
    expect(before).toBe("so_mark_read:buyer:so-room:customer:open_tail:tip-1");
    expect(after).toBe("so_mark_read:buyer:so-room:customer:open_tail:tip-2");
    expect(before).not.toBe(after);
  });

  it("SO explicit through keys do not use tip segment", () => {
    expect(
      buildSoMarkReadIdempotencyKey({
        userId: "buyer",
        roomId: "so-room",
        role: "customer",
        throughMessageId: "msg-9",
        tipMessageId: "tip-ignored",
      })
    ).toBe("so_mark_read:buyer:so-room:customer:msg-9");
  });

  it("rejects legacy fixed open / open_tail segments (regression)", () => {
    const cm = buildCmMarkReadIdempotencyKey({
      userId: "u1",
      roomId: "r1",
      openTail: true,
      requestedLastReadMessageId: "",
      tipMessageId: "m1",
    });
    const so = buildSoMarkReadIdempotencyKey({
      userId: "u1",
      roomId: "r1",
      role: "customer",
      throughMessageId: null,
      tipMessageId: "m1",
    });
    expect(cm.endsWith(":open")).toBe(false);
    expect(so.endsWith(":open_tail")).toBe(false);
  });
});
