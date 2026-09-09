/**
 * CUT-2A — Call history list query consolidation (READ path only).
 * Proves: result parity + single call_sessions round-trip on listCommunityMessengerCallLogs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const CALLER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CALLEE = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ROOM = "room-hist-1";

type QueryHit = { table: string; select?: string; limit?: number };

const queryHits: QueryHit[] = [];

function chainable(table: string, result: { data: unknown; error: unknown }) {
  const state: { select?: string; limit?: number } = {};
  const api: Record<string, unknown> = {};
  const finish = async () => {
    queryHits.push({ table, select: state.select, limit: state.limit });
    return result;
  };
  api.select = (cols: string) => {
    state.select = cols;
    return api;
  };
  api.or = () => api;
  api.order = () => api;
  api.eq = () => api;
  api.in = () => api;
  api.limit = (n: number) => {
    state.limit = n;
    return api;
  };
  api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    finish().then(resolve, reject);
  return api;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: vi.fn(),
}));

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listCommunityMessengerCallLogs } from "@/lib/community-messenger/service";

type DevState = {
  friendRequests: unknown[];
  favoriteFriends: Map<string, unknown>;
  hiddenFriends: Map<string, unknown>;
  rooms: Array<Record<string, unknown>>;
  participants: Array<Record<string, unknown>>;
  roomProfiles: unknown[];
  messages: unknown[];
  calls: Array<Record<string, unknown>>;
  callSessions: Array<Record<string, unknown>>;
  callSignals: unknown[];
};

function resetDevState(partial?: Partial<DevState>): DevState {
  const state: DevState = {
    friendRequests: [],
    favoriteFriends: new Map(),
    hiddenFriends: new Map(),
    rooms: [
      {
        id: ROOM,
        roomType: "direct",
        title: "Peer DM",
        lastMessage: null,
        lastMessageAt: null,
      },
    ],
    participants: [
      { roomId: ROOM, userId: CALLER, unreadCount: 0 },
      { roomId: ROOM, userId: CALLEE, unreadCount: 0 },
    ],
    roomProfiles: [],
    messages: [],
    calls: [],
    callSessions: [],
    callSignals: [],
    ...partial,
  };
  (globalThis as unknown as { __samarketCommunityMessengerState?: DevState }).__samarketCommunityMessengerState =
    state;
  return state;
}

function seedCall(opts: {
  id: string;
  sessionId: string;
  callKind: "voice" | "video";
  status: string;
  callerUserId: string;
  peerUserId: string;
  startedAt: string;
  durationSeconds?: number;
  endedAt?: string | null;
  endedReason?: string | null;
  answeredAt?: string | null;
  connectedAt?: string | null;
}) {
  const state = (globalThis as unknown as { __samarketCommunityMessengerState: DevState })
    .__samarketCommunityMessengerState;
  state.calls.push({
    id: opts.id,
    sessionId: opts.sessionId,
    roomId: ROOM,
    callerUserId: opts.callerUserId,
    peerUserId: opts.peerUserId,
    callKind: opts.callKind,
    status: opts.status,
    durationSeconds: opts.durationSeconds ?? 0,
    startedAt: opts.startedAt,
  });
  state.callSessions.push({
    id: opts.sessionId,
    roomId: ROOM,
    sessionMode: "direct",
    initiatorUserId: opts.callerUserId,
    recipientUserId: opts.peerUserId,
    callKind: opts.callKind,
    status: opts.status === "ended" || opts.status === "missed" || opts.status === "rejected" || opts.status === "cancelled"
      ? opts.status === "ended"
        ? "ended"
        : opts.status
      : "ended",
    startedAt: opts.startedAt,
    answeredAt: opts.answeredAt ?? null,
    connectedAt: opts.connectedAt ?? null,
    endedAt: opts.endedAt ?? null,
    endedReason: opts.endedReason ?? null,
    createdAt: opts.startedAt,
    participants: [
      { userId: opts.callerUserId, participationStatus: "joined" },
      { userId: opts.peerUserId, participationStatus: "joined" },
    ],
  });
}

describe("CUT-2A call history list query consolidation", () => {
  beforeEach(() => {
    queryHits.length = 0;
    resetDevState();
    vi.mocked(getSupabaseServer).mockImplementation(() => {
      throw new Error("no_supabase_for_dev_parity");
    });
  });

  it("1. empty history", async () => {
    const listed = await listCommunityMessengerCallLogs(CALLER);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.calls).toEqual([]);
    expect(listed.hasMore).toBe(false);
    expect(listed.nextCursor).toBeNull();
  });

  it("2–6. single/multiple/same-room/voice+video/caller+callee views", async () => {
    seedCall({
      id: "c-voice",
      sessionId: "s-voice",
      callKind: "voice",
      status: "ended",
      callerUserId: CALLER,
      peerUserId: CALLEE,
      startedAt: "2026-06-09T10:00:00.000Z",
      durationSeconds: 42,
      answeredAt: "2026-06-09T10:00:05.000Z",
      connectedAt: "2026-06-09T10:00:06.000Z",
      endedAt: "2026-06-09T10:00:48.000Z",
      endedReason: null,
    });
    seedCall({
      id: "c-video",
      sessionId: "s-video",
      callKind: "video",
      status: "ended",
      callerUserId: CALLEE,
      peerUserId: CALLER,
      startedAt: "2026-06-09T11:00:00.000Z",
      durationSeconds: 10,
      answeredAt: "2026-06-09T11:00:02.000Z",
      connectedAt: "2026-06-09T11:00:03.000Z",
      endedAt: "2026-06-09T11:00:13.000Z",
    });

    const asCallerListed = await listCommunityMessengerCallLogs(CALLER);
    expect(asCallerListed.ok).toBe(true);
    if (!asCallerListed.ok) return;
    const asCaller = asCallerListed.calls;
    expect(asCaller).toHaveLength(2);
    expect(asCaller.map((c) => c.id)).toEqual(["c-video", "c-voice"]);
    expect(asCaller[0]?.callKind).toBe("video");
    expect(asCaller[0]?.isOutgoing).toBe(false);
    expect(asCaller[0]?.peerUserId).toBe(CALLEE);
    expect(asCaller[1]?.callKind).toBe("voice");
    expect(asCaller[1]?.isOutgoing).toBe(true);
    expect(asCaller[1]?.durationSeconds).toBe(42);
    expect(asCaller[1]?.roomId).toBe(ROOM);
    expect(asCaller[1]?.sessionId).toBe("s-voice");

    const asCalleeListed = await listCommunityMessengerCallLogs(CALLEE);
    expect(asCalleeListed.ok).toBe(true);
    if (!asCalleeListed.ok) return;
    const asCallee = asCalleeListed.calls;
    expect(asCallee).toHaveLength(2);
    expect(asCallee.find((c) => c.id === "c-voice")?.isOutgoing).toBe(false);
    expect(asCallee.find((c) => c.id === "c-video")?.isOutgoing).toBe(true);
  });

  it("7–11. missed / rejected / cancelled / connected ended / failed", async () => {
    seedCall({
      id: "c-missed",
      sessionId: "s-missed",
      callKind: "voice",
      status: "missed",
      callerUserId: CALLER,
      peerUserId: CALLEE,
      startedAt: "2026-06-09T12:00:00.000Z",
      endedAt: "2026-06-09T12:00:30.000Z",
      endedReason: "missed_timeout",
    });
    seedCall({
      id: "c-rej",
      sessionId: "s-rej",
      callKind: "voice",
      status: "rejected",
      callerUserId: CALLER,
      peerUserId: CALLEE,
      startedAt: "2026-06-09T12:01:00.000Z",
      endedAt: "2026-06-09T12:01:05.000Z",
      endedReason: "rejected",
    });
    seedCall({
      id: "c-cancel",
      sessionId: "s-cancel",
      callKind: "voice",
      status: "cancelled",
      callerUserId: CALLER,
      peerUserId: CALLEE,
      startedAt: "2026-06-09T12:02:00.000Z",
      endedAt: "2026-06-09T12:02:03.000Z",
      endedReason: "canceled",
    });
    seedCall({
      id: "c-ok",
      sessionId: "s-ok",
      callKind: "voice",
      status: "ended",
      callerUserId: CALLER,
      peerUserId: CALLEE,
      startedAt: "2026-06-09T12:03:00.000Z",
      durationSeconds: 20,
      connectedAt: "2026-06-09T12:03:05.000Z",
      endedAt: "2026-06-09T12:03:25.000Z",
    });
    seedCall({
      id: "c-fail",
      sessionId: "s-fail",
      callKind: "voice",
      status: "ended",
      callerUserId: CALLER,
      peerUserId: CALLEE,
      startedAt: "2026-06-09T12:04:00.000Z",
      endedAt: "2026-06-09T12:04:10.000Z",
      endedReason: "failed_media",
    });

    const listed = await listCommunityMessengerCallLogs(CALLER);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const logs = listed.calls;
    const byId = Object.fromEntries(logs.map((c) => [c.id, c]));
    expect(byId["c-missed"]?.displayType).toBe("missed_outgoing");
    expect(byId["c-missed"]?.endedReason).toBe("missed_timeout");
    expect(byId["c-rej"]?.displayType).toBe("rejected");
    expect(byId["c-cancel"]?.displayType).toBe("cancelled");
    expect(byId["c-ok"]?.displayType).toBe("outgoing");
    expect(byId["c-ok"]?.durationSeconds).toBe(20);
    expect(byId["c-ok"]?.endedAt).toBe("2026-06-09T12:03:25.000Z");
    expect(byId["c-fail"]?.displayType).toBe("failed");
    expect(byId["c-fail"]?.endedReason).toBe("failed_media");
  });

  it("12–15. duration / peer / ordering / missing enrichment fail-safe", async () => {
    seedCall({
      id: "c-old",
      sessionId: "s-old",
      callKind: "voice",
      status: "ended",
      callerUserId: CALLER,
      peerUserId: CALLEE,
      startedAt: "2026-06-09T09:00:00.000Z",
      durationSeconds: 5,
      connectedAt: "2026-06-09T09:00:01.000Z",
      endedAt: "2026-06-09T09:00:06.000Z",
    });
    seedCall({
      id: "c-new",
      sessionId: "s-orphan",
      callKind: "video",
      status: "ended",
      callerUserId: CALLER,
      peerUserId: CALLEE,
      startedAt: "2026-06-09T13:00:00.000Z",
      durationSeconds: 7,
    });
    // orphan session id intentionally not in callSessions — fail-safe
    const state = (globalThis as unknown as { __samarketCommunityMessengerState: DevState })
      .__samarketCommunityMessengerState;
    state.callSessions = state.callSessions.filter((s) => s.id !== "s-orphan");

    const listed = await listCommunityMessengerCallLogs(CALLER);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const logs = listed.calls;
    expect(logs.map((c) => c.id)).toEqual(["c-new", "c-old"]);
    expect(logs[0]?.peerUserId).toBe(CALLEE);
    expect(logs[0]?.durationSeconds).toBe(7);
    expect(logs[1]?.durationSeconds).toBe(5);
    expect(logs[0]?.sessionId).toBe("s-orphan");
  });

  it("16–17. FETCH 31 + call_sessions queried once (DB path)", async () => {
    const logRows = Array.from({ length: 3 }, (_, i) => ({
      id: `log-${i}`,
      session_id: `sess-${i}`,
      room_id: ROOM,
      caller_user_id: CALLER,
      peer_user_id: CALLEE,
      call_kind: i % 2 === 0 ? "voice" : "video",
      status: "ended",
      duration_seconds: 10 + i,
      started_at: `2026-06-09T1${i}:00:00.000Z`,
      ended_at: `2026-06-09T1${i}:00:20.000Z`,
    }));
    const sessions = logRows.map((r) => ({
      id: r.session_id,
      room_id: ROOM,
      session_mode: "direct",
      ended_at: r.ended_at,
      ended_reason: null,
    }));

    vi.mocked(getSupabaseServer).mockImplementation(() => {
      return {
        from: (table: string) => {
          if (table === "community_messenger_call_logs") {
            return chainable(table, { data: logRows, error: null });
          }
          if (table === "community_messenger_call_sessions") {
            return chainable(table, { data: sessions, error: null });
          }
          if (table === "community_messenger_call_session_participants") {
            return chainable(table, {
              data: logRows.flatMap((r) => [
                {
                  session_id: r.session_id,
                  user_id: CALLER,
                  participation_status: "joined",
                  joined_at: r.started_at,
                  left_at: r.ended_at,
                },
                {
                  session_id: r.session_id,
                  user_id: CALLEE,
                  participation_status: "joined",
                  joined_at: r.started_at,
                  left_at: r.ended_at,
                },
              ]),
              error: null,
            });
          }
          if (table === "community_messenger_rooms") {
            return chainable(table, {
              data: [
                {
                  id: ROOM,
                  room_type: "direct",
                  room_status: "active",
                  visibility: "private",
                  join_policy: "invite",
                  identity_policy: "real_name",
                  title: "Peer",
                  last_message: null,
                  last_message_at: null,
                },
              ],
              error: null,
            });
          }
          if (table === "community_messenger_participants") {
            return chainable(table, {
              data: [
                { id: "p1", room_id: ROOM, user_id: CALLER, role: "member", unread_count: 0 },
                { id: "p2", room_id: ROOM, user_id: CALLEE, role: "member", unread_count: 0 },
              ],
              error: null,
            });
          }
          if (table === "community_messenger_room_profiles") {
            return chainable(table, { data: [], error: null });
          }
          if (table === "profiles") {
            return chainable(table, {
              data: [
                { id: CALLER, display_name: "Caller", nickname: "caller", avatar_url: null },
                { id: CALLEE, display_name: "Callee", nickname: "callee", avatar_url: null },
              ],
              error: null,
            });
          }
          // friendship / relation lookups — empty ok
          return chainable(table, { data: [], error: null });
        },
      } as never;
    });

    const listed = await listCommunityMessengerCallLogs(CALLER);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const logs = listed.calls;
    expect(logs.length).toBe(3);
    expect(logs[0]?.peerUserId).toBe(CALLEE);
    expect(logs.every((c) => c.roomId === ROOM)).toBe(true);

    const logHits = queryHits.filter((h) => h.table === "community_messenger_call_logs");
    expect(logHits.length).toBeGreaterThanOrEqual(1);
    expect(logHits.some((h) => h.limit === 31)).toBe(true);

    const sessionHits = queryHits.filter((h) => h.table === "community_messenger_call_sessions");
    expect(sessionHits).toHaveLength(1);
    expect(sessionHits[0]?.select).toContain("ended_at");
    expect(sessionHits[0]?.select).toContain("session_mode");
    expect(sessionHits[0]?.select).toContain("room_id");
  });
});
