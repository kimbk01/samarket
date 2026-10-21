import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/stores/messenger-realtime-store", () => ({
  getMessengerRealtimeRoomMessages: () => storeRows,
}));

import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { mergePrimedTimelineSeedIntoExisting } from "@/lib/community-messenger/room/merge-primed-timeline-seed";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

type Row = CommunityMessengerMessage & { pending?: boolean; sendFailed?: boolean };
let storeRows: Row[] = [];

const ME = "11111111-1111-4111-8111-111111111111";
const msg = (id: string, over: Partial<Row> = {}): Row =>
  ({
    id,
    roomId: "r",
    senderId: ME,
    senderLabel: "me",
    messageType: "text",
    content: id,
    createdAt: "2026-10-21T00:00:00.000Z",
    isMine: true,
    callKind: null,
    callStatus: null,
    ...over,
  }) as Row;

describe("M-2 pending/failed rows survive merges (I1·I2)", () => {
  it("T1 pending row kept when next is empty", () => {
    const out = mergeRoomMessages([msg("pending:r:1", { pending: true, clientMessageId: "a" })], []);
    expect(out).toHaveLength(1);
    expect(out[0].pending).toBe(true);
  });

  it("T2 failed row passed as `next` is not forced to confirmed", () => {
    const failed = msg("pending:r:1", { pending: true, sendFailed: true, clientMessageId: "a" });
    const out = mergeRoomMessages([msg("s1", { createdAt: "2026-10-20T00:00:00.000Z" })], [failed]) as Row[];
    const kept = out.find((m) => m.id === "pending:r:1")!;
    expect(kept.pending).toBe(true);
    expect(kept.sendFailed).toBe(true);
  });

  it("T2b primed seed merge keeps the retry affordance (pending && sendFailed)", () => {
    storeRows = [];
    const prev = [
      msg("s0", { createdAt: "2026-10-20T00:00:00.000Z" }),
      msg("pending:r:2", { pending: true, sendFailed: true, clientMessageId: "b" }),
    ];
    const out = mergePrimedTimelineSeedIntoExisting({
      roomId: "r",
      prev,
      seed: [msg("s0", { createdAt: "2026-10-20T00:00:00.000Z" })],
    }) as Row[];
    const failed = out.find((m) => m.id === "pending:r:2")!;
    expect(failed.pending && failed.sendFailed).toBe(true);
  });

  it("T3 server row with same cid replaces the failed row (one row)", () => {
    const failed = msg("pending:r:1", { pending: true, sendFailed: true, clientMessageId: "a" });
    const out = mergeRoomMessages([failed], [msg("srv-1", { clientMessageId: "a" })]);
    expect(out.map((m) => m.id)).toEqual(["srv-1"]);
    expect(out[0].pending).toBe(false);
  });

  it("T4 identical content pending rows: only the matching cid is confirmed", () => {
    const prev = [
      msg("pending:r:1", { pending: true, clientMessageId: "c1", content: "same" }),
      msg("pending:r:2", { pending: true, clientMessageId: "c2", content: "same" }),
    ];
    const out = mergeRoomMessages(prev, [msg("srv-1", { clientMessageId: "c1", content: "same" })]);
    expect(out.map((m) => m.id).sort()).toEqual(["pending:r:2", "srv-1"]);
  });
});
