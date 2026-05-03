import { describe, expect, it } from "vitest";
import { shouldAdvancePeerReadReceiptCursor } from "@/lib/community-messenger/room/messenger-peer-read-cursor-guard";

describe("shouldAdvancePeerReadReceiptCursor", () => {
  const ts = (iso: string) => iso;

  it("advances when prev empty", () => {
    expect(
      shouldAdvancePeerReadReceiptCursor({
        prev: undefined,
        nextMessageId: "m2",
        nextReadAt: ts("2026-01-02T00:00:00.000Z"),
        messageCreatedAtById: new Map([
          ["m1", "2026-01-01T00:00:00.000Z"],
          ["m2", "2026-01-02T00:00:00.000Z"],
        ]),
      })
    ).toBe(true);
  });

  it("rejects older cursor by message createdAt", () => {
    expect(
      shouldAdvancePeerReadReceiptCursor({
        prev: {
          roomId: "r",
          readerUserId: "u",
          lastReadMessageId: "m2",
          lastReadAt: "2026-01-02T00:00:00.000Z",
        },
        nextMessageId: "m1",
        nextReadAt: ts("2026-01-03T00:00:00.000Z"),
        messageCreatedAtById: new Map([
          ["m1", "2026-01-01T00:00:00.000Z"],
          ["m2", "2026-01-02T00:00:00.000Z"],
        ]),
      })
    ).toBe(false);
  });

  it("same message id allows newer last_read_at", () => {
    expect(
      shouldAdvancePeerReadReceiptCursor({
        prev: {
          roomId: "r",
          readerUserId: "u",
          lastReadMessageId: "m2",
          lastReadAt: "2026-01-02T00:00:00.000Z",
        },
        nextMessageId: "m2",
        nextReadAt: ts("2026-01-02T00:00:01.000Z"),
        messageCreatedAtById: new Map([["m2", "2026-01-02T00:00:00.000Z"]]),
      })
    ).toBe(true);
  });
});
