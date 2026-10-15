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

  it("this device's optimistic send (clientMessageId local) → skip", () => {
    expect(
      decide({
        clientMessageId: "cid-1",
        localMessages: [{ id: "pending:cid-1", clientMessageId: "cid-1" }],
      })
    ).toBe("skip");
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
