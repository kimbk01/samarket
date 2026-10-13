/**
 * Call stub sender Authority — chat list (call_stub) must not diverge from call history
 * when the terminal actor has left the room.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALL_STUB_NO_ACTIVE_SENDER_ERROR,
  pickActiveCallStubSender,
  resolveCallStubSenderCandidates,
} from "@/lib/community-messenger/call-authority/call-stub-sender-authority";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const insertedCallLogs: Row[] = [];

function makeBuilder(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    update: () => builder,
    is: () => builder,
    eq: (col: string, value: unknown) => {
      filters.push((row) => row[col] === value);
      return builder;
    },
    in: (col: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[col]));
      return builder;
    },
    insert: async (payload: Row) => {
      if (table === "community_messenger_call_logs") insertedCallLogs.push(payload);
      return { error: null };
    },
    maybeSingle: async () => ({
      data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row)))[0] ?? null,
      error: null,
    }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))), error: null }),
  };
  return builder;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({ from: (table: string) => makeBuilder(table) }),
}));

const appendAtomicMock = vi.fn(
  async (_sb: unknown, input: { senderId: string; roomId: string }) => {
    const part = (tables.community_messenger_participants ?? []).find(
      (r) => r.room_id === input.roomId && r.user_id === input.senderId
    );
    if (!part) return { ok: false as const, error: "not_member", fallbackUsed: false as const };
    if (part.left_at) return { ok: false as const, error: "participant_left", fallbackUsed: false as const };
    return {
      ok: true as const,
      messageId: "msg-1",
      createdAt: "2026-06-09T10:00:00.000Z",
      recipientUserIds: [],
      deduped: false,
      rpcUsed: "dibay_append_room_message_atomic" as const,
      fallbackUsed: false as const,
    };
  }
);

vi.mock("@/lib/community-messenger/room-unread-authority-rpc", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appendTypedMessengerMessageAtomic: (sb: unknown, input: { senderId: string; roomId: string }) =>
    appendAtomicMock(sb, input),
}));

vi.mock("@/lib/community-messenger/server/publish-messenger-room-bump", () => ({
  publishMessengerRoomBumpAfterMutation: vi.fn(async () => {}),
}));

import {
  appendCommunityMessengerCallStubMessage,
  createCommunityMessengerCallLog,
} from "@/lib/community-messenger/service";

const baseStub = {
  roomId: "room-1",
  sessionId: "sess-1",
  callKind: "voice" as const,
  status: "rejected" as const,
  createdAt: "2026-06-09T10:00:00.000Z",
  listActivityAt: "2026-06-09T10:00:20.000Z",
  bumpRoomLastMessageAt: true,
  initiatorUserId: "caller",
  recipientUserId: "callee",
};

describe("call stub sender authority (pure)", () => {
  it("orders candidates preferred → terminal actor → initiator → recipient without duplicates", () => {
    expect(
      resolveCallStubSenderCandidates({
        preferredUserId: "callee",
        terminalActorUserId: "callee",
        initiatorUserId: "caller",
        recipientUserId: "callee",
      })
    ).toEqual(["callee", "caller"]);
  });

  it("skips left / missing participants", () => {
    expect(
      pickActiveCallStubSender(
        ["callee", "caller"],
        [
          { user_id: "callee", left_at: "2026-06-01T00:00:00.000Z" },
          { user_id: "caller", left_at: null },
        ]
      )
    ).toBe("caller");
    expect(pickActiveCallStubSender(["callee", "caller"], [{ user_id: "caller", left_at: "x" }])).toBeNull();
  });
});

describe("appendCommunityMessengerCallStubMessage — active sender + surfaced failure", () => {
  beforeEach(() => {
    for (const key of Object.keys(tables)) delete tables[key];
    insertedCallLogs.length = 0;
    appendAtomicMock.mockClear();
    tables.community_messenger_messages = [];
    tables.community_messenger_rooms = [{ id: "room-1", last_message_at: "2026-06-01T00:00:00.000Z" }];
  });

  it("falls back to the still-active party when the terminal actor left the room", async () => {
    tables.community_messenger_participants = [
      { room_id: "room-1", user_id: "callee", left_at: "2026-06-05T00:00:00.000Z" },
      { room_id: "room-1", user_id: "caller", left_at: null },
    ];
    const result = await appendCommunityMessengerCallStubMessage({ ...baseStub, userId: "callee" });
    expect(result).toEqual({ ok: true, messageId: "msg-1", senderId: "caller" });
    expect(appendAtomicMock).toHaveBeenCalledTimes(1);
    expect(appendAtomicMock.mock.calls[0]![1]).toEqual(expect.objectContaining({ senderId: "caller" }));
  });

  it("returns an explicit error (not a silent drop) when no call party is an active member", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    tables.community_messenger_participants = [
      { room_id: "room-1", user_id: "callee", left_at: "2026-06-05T00:00:00.000Z" },
    ];
    const result = await appendCommunityMessengerCallStubMessage({ ...baseStub, userId: "callee" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(CALL_STUB_NO_ACTIVE_SENDER_ERROR);
    expect(appendAtomicMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(
      "[room_unread_v1] call_stub_append",
      expect.objectContaining({ code: "cm_call_stub_projection_failed", error: CALL_STUB_NO_ACTIVE_SENDER_ERROR })
    );
    errSpy.mockRestore();
  });

  it("createCommunityMessengerCallLog surfaces stub projection failure while keeping the call log", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    tables.community_messenger_participants = [];
    const result = await createCommunityMessengerCallLog({
      userId: "caller",
      stubActorUserId: "callee",
      roomId: "room-1",
      sessionId: "sess-1",
      peerUserId: "callee",
      callKind: "voice",
      status: "rejected",
      startedAt: "2026-06-09T10:00:00.000Z",
      endedAt: "2026-06-09T10:00:20.000Z",
      initiatorUserId: "caller",
      recipientUserId: "callee",
    });
    expect(insertedCallLogs).toHaveLength(1);
    expect(result).toEqual({
      ok: false,
      error: `call_stub_projection_failed:${CALL_STUB_NO_ACTIVE_SENDER_ERROR}`,
      callLogPersisted: true,
    });
    errSpy.mockRestore();
  });

  it("createCommunityMessengerCallLog projects the stub via the active initiator when the rejecting callee left", async () => {
    tables.community_messenger_participants = [
      { room_id: "room-1", user_id: "callee", left_at: "2026-06-05T00:00:00.000Z" },
      { room_id: "room-1", user_id: "caller", left_at: null },
    ];
    const result = await createCommunityMessengerCallLog({
      userId: "caller",
      stubActorUserId: "callee",
      roomId: "room-1",
      sessionId: "sess-1",
      peerUserId: "callee",
      callKind: "voice",
      status: "rejected",
      startedAt: "2026-06-09T10:00:00.000Z",
      endedAt: "2026-06-09T10:00:20.000Z",
      initiatorUserId: "caller",
      recipientUserId: "callee",
    });
    expect(result).toEqual({ ok: true, callLogPersisted: true });
    expect(appendAtomicMock.mock.calls[0]![1]).toEqual(expect.objectContaining({ senderId: "caller" }));
  });
});
