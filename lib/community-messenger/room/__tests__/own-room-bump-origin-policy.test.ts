import { describe, expect, it } from "vitest";
import { resolveOwnRoomBumpDecision } from "@/lib/community-messenger/room/own-room-bump-origin-policy";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const STUB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function decide(over: Partial<Parameters<typeof resolveOwnRoomBumpDecision>[0]>) {
  return resolveOwnRoomBumpDecision({
    viewerUserId: VIEWER,
    fromUserId: VIEWER,
    rawSenderId: VIEWER,
    isStoreOrderSystemBump: false,
    messageId: STUB_ID,
    clientMessageId: "",
    localMessages: [],
    ...over,
  });
}

describe("own room bump origin policy (F1: caller cancel stub must reach caller)", () => {
  it("server-authored call_stub in viewer's name (no clientMessageId, not local) → apply", () => {
    expect(decide({})).toBe("apply");
  });

  it("this device's optimistic send still pending (clientMessageId local) → replace_pending", () => {
    expect(
      decide({
        clientMessageId: "cid-1",
        localMessages: [{ id: "pending:room:1", clientMessageId: "cid-1", pending: true }],
      })
    ).toBe("replace_pending");
    /** `pending:` id without explicit flag is still optimistic */
    expect(
      decide({
        clientMessageId: "cid-1",
        localMessages: [{ id: "pending:cid-1", clientMessageId: "cid-1" }],
      })
    ).toBe("replace_pending");
  });

  it("C-1: own edit/delete from another device — confirmed HTTP row carries cid → merge_only (not skipped)", () => {
    expect(
      decide({
        clientMessageId: "cid-1",
        localMessages: [{ id: STUB_ID, clientMessageId: "cid-1", pending: false }],
      })
    ).toBe("merge_only");
    expect(
      decide({
        clientMessageId: "cid-1",
        localMessages: [{ id: STUB_ID, clientMessageId: "cid-1" }],
      })
    ).toBe("merge_only");
  });

  it("confirmed match wins over a stale pending duplicate with the same cid", () => {
    expect(
      decide({
        clientMessageId: "cid-1",
        localMessages: [
          { id: "pending:image:room:3", clientMessageId: "cid-1", pending: true },
          { id: STUB_ID, clientMessageId: "cid-1" },
        ],
      })
    ).toBe("merge_only");
  });

  it("sticker row ACKed in place (pending:false, temp id) → merge_only so the server row replaces it by cid", () => {
    expect(
      decide({
        clientMessageId: "cid-s",
        localMessages: [{ id: "pending:sticker:room:2", clientMessageId: "cid-s", pending: false }],
      })
    ).toBe("merge_only");
  });

  it("same account other device send (cid not local) → apply", () => {
    expect(
      decide({ clientMessageId: "cid-other-device", localMessages: [{ id: "x", clientMessageId: "cid-1" }] })
    ).toBe("apply");
  });

  it("row already local by id (in-place update) → merge_only", () => {
    expect(decide({ localMessages: [{ id: STUB_ID }] })).toBe("merge_only");
  });

  it("peer bump and peer-mutated update → apply", () => {
    expect(decide({ fromUserId: PEER, rawSenderId: PEER })).toBe("apply");
    expect(decide({ rawSenderId: PEER, localMessages: [{ id: STUB_ID }] })).toBe("apply");
  });

  it("store order system bump → apply", () => {
    expect(decide({ isStoreOrderSystemBump: true, clientMessageId: "c", localMessages: [{ clientMessageId: "c" }] })).toBe(
      "apply"
    );
  });
});

describe("replace_pending merge safety (mergeRoomMessages cid dedupe)", () => {
  it("validated own image snapshot replaces the pending media row with the same cid (no duplicate)", async () => {
    const { mergeRoomMessages } = await import("@/components/community-messenger/room/community-messenger-room-helpers");
    const pendingRow = {
      id: "pending:image:room:7",
      roomId: "r",
      senderId: VIEWER,
      senderLabel: "me",
      messageType: "image" as const,
      content: "blob:local",
      createdAt: "2026-10-01T00:00:00.000Z",
      isMine: true,
      clientMessageId: "cid-img",
      pending: true,
    };
    const otherPending = { ...pendingRow, id: "pending:image:room:8", clientMessageId: "cid-other" };
    const confirmed = {
      ...pendingRow,
      id: STUB_ID,
      content: "https://cdn.example/a.jpg",
      createdAt: "2026-10-01T00:00:03.000Z",
      pending: undefined,
    };
    const merged = mergeRoomMessages([pendingRow, otherPending], [confirmed]);
    expect(merged.map((m) => m.id).sort()).toEqual([STUB_ID, "pending:image:room:8"].sort());
    expect(merged.find((m) => m.id === STUB_ID)?.pending).toBe(false);
  });
});
