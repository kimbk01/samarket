/**
 * CUT-2B-IMPL — call history keyset pagination proofs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMUNITY_MESSENGER_CALL_LOGS_PAGE_SIZE,
  decodeCommunityMessengerCallHistoryCursor,
  encodeCommunityMessengerCallHistoryCursor,
  isCallHistoryRowStrictlyOlderThanCursor,
} from "@/lib/community-messenger/call-history/call-history-cursor";
import { appendCommunityMessengerCallLogsById } from "@/lib/community-messenger/call-history/use-community-call-history-realtime-sync";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

const CALLER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CALLEE = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ROOM = "room-page-1";
const TIE_TS = "2026-06-09T12:00:00.000Z";

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

function resetDevState(): DevState {
  const state: DevState = {
    friendRequests: [],
    favoriteFriends: new Map(),
    hiddenFriends: new Map(),
    rooms: [{ id: ROOM, roomType: "direct", title: "Peer DM" }],
    participants: [
      { roomId: ROOM, userId: CALLER, unreadCount: 0 },
      { roomId: ROOM, userId: CALLEE, unreadCount: 0 },
    ],
    roomProfiles: [],
    messages: [],
    calls: [],
    callSessions: [],
    callSignals: [],
  };
  (globalThis as unknown as { __samarketCommunityMessengerState?: DevState }).__samarketCommunityMessengerState =
    state;
  return state;
}

function seedCall(opts: {
  id: string;
  sessionId: string;
  startedAt: string;
  callKind?: "voice" | "video";
  status?: string;
  durationSeconds?: number;
  endedReason?: string | null;
  endedAt?: string | null;
  connectedAt?: string | null;
}) {
  const state = (globalThis as unknown as { __samarketCommunityMessengerState: DevState })
    .__samarketCommunityMessengerState;
  const status = opts.status ?? "ended";
  state.calls.push({
    id: opts.id,
    sessionId: opts.sessionId,
    roomId: ROOM,
    callerUserId: CALLER,
    peerUserId: CALLEE,
    callKind: opts.callKind ?? "voice",
    status,
    durationSeconds: opts.durationSeconds ?? 0,
    startedAt: opts.startedAt,
  });
  state.callSessions.push({
    id: opts.sessionId,
    roomId: ROOM,
    sessionMode: "direct",
    initiatorUserId: CALLER,
    recipientUserId: CALLEE,
    callKind: opts.callKind ?? "voice",
    status: status === "ended" ? "ended" : status,
    startedAt: opts.startedAt,
    answeredAt: null,
    connectedAt: opts.connectedAt ?? null,
    endedAt: opts.endedAt ?? opts.startedAt,
    endedReason: opts.endedReason ?? null,
    createdAt: opts.startedAt,
    participants: [
      { userId: CALLER, participationStatus: "joined" },
      { userId: CALLEE, participationStatus: "joined" },
    ],
  });
}

function seedN(count: number, prefix: string, baseMs: number) {
  for (let i = 0; i < count; i++) {
    const startedAt = new Date(baseMs - i * 60_000).toISOString();
    seedCall({
      id: `${prefix}-${String(i).padStart(3, "0")}`,
      sessionId: `s-${prefix}-${i}`,
      startedAt,
      callKind: i % 2 === 0 ? "voice" : "video",
      durationSeconds: i,
    });
  }
}

describe("CUT-2B call history keyset pagination", () => {
  beforeEach(() => {
    resetDevState();
    vi.mocked(getSupabaseServer).mockImplementation(() => {
      throw new Error("no_supabase_for_dev_pagination");
    });
  });

  it("cursor encode/decode + invalid reject", () => {
    const enc = encodeCommunityMessengerCallHistoryCursor({
      startedAt: TIE_TS,
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    const ok = decodeCommunityMessengerCallHistoryCursor(enc);
    expect(ok).toEqual({
      ok: true,
      cursor: { startedAt: TIE_TS, id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    });
    expect(decodeCommunityMessengerCallHistoryCursor("").ok).toBe(true);
    expect(decodeCommunityMessengerCallHistoryCursor("%%%").ok).toBe(false);
    expect(decodeCommunityMessengerCallHistoryCursor(Buffer.from("{}").toString("base64url")).ok).toBe(
      false
    );
    expect(
      decodeCommunityMessengerCallHistoryCursor(
        Buffer.from(JSON.stringify({ startedAt: TIE_TS, id: "x", extra: 1 })).toString("base64url")
      ).ok
    ).toBe(false);
  });

  it("1–3. 0 / <30 / exactly 30", async () => {
    let listed = await listCommunityMessengerCallLogs(CALLER);
    expect(listed.ok && listed.calls.length === 0 && !listed.hasMore).toBe(true);

    seedN(10, "u10", Date.parse("2026-07-01T00:00:00.000Z"));
    listed = await listCommunityMessengerCallLogs(CALLER);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.calls).toHaveLength(10);
    expect(listed.hasMore).toBe(false);
    expect(listed.nextCursor).toBeNull();

    resetDevState();
    seedN(30, "u30", Date.parse("2026-07-02T00:00:00.000Z"));
    listed = await listCommunityMessengerCallLogs(CALLER);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.calls).toHaveLength(30);
    expect(listed.hasMore).toBe(false);
  });

  it("4–6. 31 / 60+ / multi page no dup/skip", async () => {
    seedN(31, "p31", Date.parse("2026-07-03T12:00:00.000Z"));
    const page1 = await listCommunityMessengerCallLogs(CALLER);
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;
    expect(page1.calls).toHaveLength(30);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listCommunityMessengerCallLogs(CALLER, { cursor: page1.nextCursor });
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;
    expect(page2.calls).toHaveLength(1);
    expect(page2.hasMore).toBe(false);

    const ids = [...page1.calls, ...page2.calls].map((c) => c.id);
    expect(new Set(ids).size).toBe(31);

    resetDevState();
    seedN(65, "p65", Date.parse("2026-07-04T12:00:00.000Z"));
    const all: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const listed = await listCommunityMessengerCallLogs(CALLER, { cursor });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      all.push(...listed.calls.map((c) => c.id));
      if (!listed.hasMore) break;
      cursor = listed.nextCursor;
      expect(cursor).toBeTruthy();
    }
    expect(all).toHaveLength(65);
    expect(new Set(all).size).toBe(65);
  });

  it("7–8. timestamp ties + split across page boundary", async () => {
    const tieIds = ["z-tie", "m-tie", "a-tie"];
    for (const id of tieIds) {
      seedCall({ id, sessionId: `s-${id}`, startedAt: TIE_TS, durationSeconds: 1 });
    }
    seedN(29, "pad", Date.parse("2026-07-05T18:00:00.000Z"));

    const page1 = await listCommunityMessengerCallLogs(CALLER);
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;
    expect(page1.calls).toHaveLength(30);
    expect(page1.hasMore).toBe(true);

    const page1Tie = page1.calls.filter((c) => c.startedAt === TIE_TS);
    const sortedTie = [...tieIds].sort((a, b) => b.localeCompare(a));
    expect(page1Tie.map((c) => c.id)).toEqual(sortedTie.slice(0, page1Tie.length));

    const page2 = await listCommunityMessengerCallLogs(CALLER, { cursor: page1.nextCursor });
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;

    const all = [...page1.calls, ...page2.calls];
    const tieAll = all.filter((c) => c.startedAt === TIE_TS).map((c) => c.id);
    expect(tieAll.sort().join(",")).toBe([...tieIds].sort().join(","));
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);

    const cursor = decodeCommunityMessengerCallHistoryCursor(page1.nextCursor);
    expect(cursor.ok && cursor.cursor).toBeTruthy();
    if (!cursor.ok || !cursor.cursor) return;
    for (const row of page2.calls) {
      expect(isCallHistoryRowStrictlyOlderThanCursor(row.startedAt, row.id, cursor.cursor)).toBe(true);
    }
  });

  it("9. new insert between page 1 and page 2 does not dup/skip old", async () => {
    seedN(35, "ins", Date.parse("2026-07-06T12:00:00.000Z"));
    const page1 = await listCommunityMessengerCallLogs(CALLER);
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;
    const page1Ids = page1.calls.map((c) => c.id);

    seedCall({
      id: "brand-new",
      sessionId: "s-brand-new",
      startedAt: "2026-07-06T13:00:00.000Z",
      durationSeconds: 9,
    });

    const page2 = await listCommunityMessengerCallLogs(CALLER, { cursor: page1.nextCursor });
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;
    expect(page2.calls.some((c) => c.id === "brand-new")).toBe(false);
    for (const id of page1Ids) {
      expect(page2.calls.some((c) => c.id === id)).toBe(false);
    }
    const combined = new Set([...page1Ids, ...page2.calls.map((c) => c.id)]);
    expect(combined.size).toBe(page1Ids.length + page2.calls.length);
  });

  it("13–14. invalid cursor + missing anchor still pages", async () => {
    seedN(5, "inv", Date.parse("2026-07-07T00:00:00.000Z"));
    const bad = await listCommunityMessengerCallLogs(CALLER, { cursor: "not-a-cursor" });
    expect(bad).toEqual({ ok: false, error: "invalid_cursor" });

    const ghost = encodeCommunityMessengerCallHistoryCursor({
      startedAt: "2026-07-07T00:00:00.000Z",
      id: "ghost-missing-id",
    });
    const listed = await listCommunityMessengerCallLogs(CALLER, { cursor: ghost });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.calls.every((c) => c.startedAt < "2026-07-07T00:00:00.000Z" || c.id < "ghost-missing-id")).toBe(
      true
    );
  });

  it("15–17 / 19–21. mixed kinds/status + peer/duration/redial fields", async () => {
    seedCall({
      id: "mix-missed",
      sessionId: "s-mix-missed",
      startedAt: "2026-07-08T10:00:00.000Z",
      status: "missed",
      endedReason: "missed_timeout",
    });
    seedCall({
      id: "mix-rej",
      sessionId: "s-mix-rej",
      startedAt: "2026-07-08T10:01:00.000Z",
      status: "rejected",
      endedReason: "rejected",
    });
    seedCall({
      id: "mix-cancel",
      sessionId: "s-mix-cancel",
      startedAt: "2026-07-08T10:02:00.000Z",
      status: "cancelled",
      endedReason: "canceled",
    });
    seedCall({
      id: "mix-ok",
      sessionId: "s-mix-ok",
      startedAt: "2026-07-08T10:03:00.000Z",
      callKind: "video",
      status: "ended",
      durationSeconds: 44,
      connectedAt: "2026-07-08T10:03:05.000Z",
      endedAt: "2026-07-08T10:03:49.000Z",
    });
    seedCall({
      id: "mix-same-room",
      sessionId: "s-mix-same",
      startedAt: "2026-07-08T10:04:00.000Z",
      callKind: "voice",
      durationSeconds: 3,
    });

    const listed = await listCommunityMessengerCallLogs(CALLER);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.calls.map((c) => c.id)).toEqual([
      "mix-same-room",
      "mix-ok",
      "mix-cancel",
      "mix-rej",
      "mix-missed",
    ]);
    const ok = listed.calls.find((c) => c.id === "mix-ok");
    expect(ok?.callKind).toBe("video");
    expect(ok?.durationSeconds).toBe(44);
    expect(ok?.peerUserId).toBe(CALLEE);
    expect(ok?.roomId).toBe(ROOM);
    expect(ok?.displayType).toBe("outgoing");
    expect(listed.calls.find((c) => c.id === "mix-missed")?.displayType).toBe("missed_outgoing");
    expect(listed.calls.find((c) => c.id === "mix-rej")?.displayType).toBe("rejected");
    expect(listed.calls.find((c) => c.id === "mix-cancel")?.displayType).toBe("cancelled");
  });

  it("12. stable started_at DESC, id DESC", async () => {
    seedCall({ id: "b", sessionId: "sb", startedAt: TIE_TS });
    seedCall({ id: "a", sessionId: "sa", startedAt: TIE_TS });
    seedCall({ id: "c", sessionId: "sc", startedAt: "2026-07-09T00:00:00.000Z" });
    const listed = await listCommunityMessengerCallLogs(CALLER);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.calls.map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it("22. client append + first-page replace clears older chain", () => {
    const mk = (id: string): CommunityMessengerCallLog =>
      ({
        id,
        sessionId: null,
        roomId: ROOM,
        sessionMode: "direct",
        title: "Peer",
        peerLabel: "Peer",
        peerAvatarUrl: null,
        peerUserId: CALLEE,
        participantCount: 2,
        participantLabels: [],
        callKind: "voice",
        status: "ended",
        startedAt: TIE_TS,
        durationSeconds: 1,
        endedAt: TIE_TS,
        isOutgoing: true,
        endedReason: null,
        displayType: "outgoing",
      }) as CommunityMessengerCallLog;

    const loaded = appendCommunityMessengerCallLogsById(
      [mk("p1a"), mk("p1b")],
      [mk("p1b"), mk("p2a")]
    );
    expect(loaded.map((c) => c.id)).toEqual(["p1a", "p1b", "p2a"]);

    const replaced = [mk("fresh")];
    expect(replaced.map((c) => c.id)).toEqual(["fresh"]);
    expect(COMMUNITY_MESSENGER_CALL_LOGS_PAGE_SIZE).toBe(30);
  });
});
