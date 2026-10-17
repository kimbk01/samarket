import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/stores/messenger-realtime-store", () => ({
  applyIncomingMessageEvent: vi.fn(),
}));
vi.mock("@/lib/community-messenger/realtime/global-messenger-room-bundle-channel", () => ({
  isOpenRoomTerminalCatchUpPendingForRoom: () => false,
}));

import {
  clearMessengerRoomTimelineGap,
  detectMessengerTimelineWindowGapAnchor,
  noteMessengerRoomTimelineGap,
  noteMessengerRoomTimelineGapFromWindows,
  peekMessengerRoomTimelineGap,
  resetMessengerRoomTimelineGapsForTests,
  subscribeMessengerRoomTimelineGap,
} from "@/lib/community-messenger/room/messenger-room-catchup-anchor";
import {
  createMessengerRoomRemoteCatchup,
  resetMessengerRoomRemoteCatchupStateForTests,
} from "@/lib/community-messenger/room/use-messenger-room-remote-catchup";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/**
 * 타임라인 갭 — (1) bump 합침·취소로 앞선 bump 가 버려짐, (2) 재입장 시 로컬 창과 서버 최신 창 불연속.
 * 등록된 갭은 그 앵커부터 `after=` 로 메운다. 평상시 bump 는 요청 수가 늘지 않는다.
 */
const ROOM = "a4b49e55-a95f-4872-88a5-cc309f3d9814";
const VIEWER = "11111111-1111-4111-8111-111111111111";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function msg(n: number): CommunityMessengerMessage {
  return {
    id: uuid(n),
    roomId: ROOM,
    senderId: VIEWER,
    senderLabel: "me",
    messageType: "text",
    content: `m${n}`,
    createdAt: `2026-10-01T00:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}.000Z`,
    isMine: true,
  };
}

type Route = (url: string) => { status: number; body?: unknown };

function harness(initial: CommunityMessengerMessage[], route: Route) {
  const calls: string[] = [];
  let rows: Array<CommunityMessengerMessage & { pending?: boolean }> = [...initial];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const r = route(url);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  const api = createMessengerRoomRemoteCatchup({
    roomId: ROOM,
    streamRoomId: ROOM,
    refresh: vi.fn(async () => undefined),
    snapshotRef: {
      current: { viewerUserId: VIEWER, room: { id: ROOM } } as unknown as CommunityMessengerRoomSnapshot,
    },
    roomMessagesRef: {
      get current() {
        return rows;
      },
    },
    setRoomMessages: (next) => {
      rows = typeof next === "function" ? next(rows) : next;
    },
    fetchImpl,
    sleep: async () => undefined,
    setTimer: () => 0,
  });
  const afterAnchors = () =>
    calls.map((c) => /[?&]after=([^&]+)/.exec(c)?.[1]).filter((v): v is string => Boolean(v)).map(decodeURIComponent);
  return { api, calls, rows: () => rows, afterAnchors };
}

const afterOf = (url: string) => decodeURIComponent(/[?&]after=([^&]+)/.exec(url)?.[1] ?? "");
const isSingle = (url: string) => /\/messages\/[0-9a-f-]{36}$/.test(url);

beforeEach(() => {
  resetMessengerRoomRemoteCatchupStateForTests();
  resetMessengerRoomTimelineGapsForTests();
});

describe("detectMessengerTimelineWindowGapAnchor", () => {
  it("overlapping windows → no gap", () => {
    expect(detectMessengerTimelineWindowGapAnchor([msg(1), msg(2), msg(3)], [msg(3), msg(4)])).toBeNull();
  });
  it("local older window not reaching server oldest → newest older local row is the anchor", () => {
    expect(detectMessengerTimelineWindowGapAnchor([msg(1), msg(2)], [msg(8), msg(9), msg(10)])).toBe(uuid(2));
  });
  it("empty local or local entirely inside server window → no gap", () => {
    expect(detectMessengerTimelineWindowGapAnchor([], [msg(8)])).toBeNull();
    expect(detectMessengerTimelineWindowGapAnchor([msg(9)], [msg(8), msg(10)])).toBeNull();
  });
});

describe("timeline gap registry", () => {
  it("keeps the older anchor, notifies listeners, case-insensitive room key", () => {
    const seen: string[] = [];
    subscribeMessengerRoomTimelineGap((k) => seen.push(k));
    expect(noteMessengerRoomTimelineGap(ROOM, uuid(5), msg(5).createdAt)).toBe(true);
    expect(noteMessengerRoomTimelineGap(ROOM.toUpperCase(), uuid(7), msg(7).createdAt)).toBe(false);
    expect(noteMessengerRoomTimelineGap(ROOM, uuid(3), msg(3).createdAt)).toBe(true);
    expect(peekMessengerRoomTimelineGap(ROOM)).toBe(uuid(3));
    expect(seen).toEqual([ROOM, ROOM]);
    clearMessengerRoomTimelineGap(ROOM, uuid(5));
    expect(peekMessengerRoomTimelineGap(ROOM)).toBe(uuid(3));
    clearMessengerRoomTimelineGap(ROOM, uuid(3));
    expect(peekMessengerRoomTimelineGap(ROOM)).toBeNull();
  });
  it("re-entry seed: device window [1,2] vs server window [8..10] registers anchor 2", () => {
    expect(noteMessengerRoomTimelineGapFromWindows(ROOM, [msg(1), msg(2)], [msg(8), msg(9), msg(10)])).toBe(true);
    expect(peekMessengerRoomTimelineGap(ROOM)).toBe(uuid(2));
  });
});

describe("catchUpTimelineGap", () => {
  it("fills from the gap anchor (not the newest row) and clears when complete", async () => {
    const h = harness([msg(1), msg(2), msg(5)], (url) =>
      afterOf(url) === uuid(2)
        ? { status: 200, body: { ok: true, messages: [msg(3), msg(4)], hasMore: false } }
        : { status: 200, body: { ok: true, messages: [] } }
    );
    noteMessengerRoomTimelineGap(ROOM, uuid(2), msg(2).createdAt, { notify: false });
    expect(await h.api.catchUpTimelineGap()).toBe("merged");
    expect(h.afterAnchors()).toEqual([uuid(2)]);
    expect(h.rows().map((m) => m.id)).toEqual(expect.arrayContaining([uuid(3), uuid(4)]));
    expect(peekMessengerRoomTimelineGap(ROOM)).toBeNull();
  });

  it("page cap reached → gap advances to the last merged row (next event continues)", async () => {
    let n = 10;
    const h = harness([msg(1)], () => {
      const page = [msg(n + 1), msg(n + 2)];
      n += 2;
      return { status: 200, body: { ok: true, messages: page, hasMore: true } };
    });
    noteMessengerRoomTimelineGap(ROOM, uuid(1), msg(1).createdAt, { notify: false });
    expect(await h.api.catchUpTimelineGap()).toBe("merged");
    expect(peekMessengerRoomTimelineGap(ROOM)).toBe(uuid(n));
  });

  it("anchor 404 (hidden for viewer) → gap cleared; 429 → gap kept for the next event", async () => {
    const gone = harness([msg(1)], (url) =>
      url.includes("after=") ? { status: 404, body: { ok: false, code: "not_found" } } : { status: 200, body: { ok: true, messages: [] } }
    );
    noteMessengerRoomTimelineGap(ROOM, uuid(1), msg(1).createdAt, { notify: false });
    await gone.api.catchUpTimelineGap();
    expect(peekMessengerRoomTimelineGap(ROOM)).toBeNull();

    resetMessengerRoomRemoteCatchupStateForTests();
    const limited = harness([msg(1)], () => ({ status: 429 }));
    noteMessengerRoomTimelineGap(ROOM, uuid(1), msg(1).createdAt, { notify: false });
    expect(await limited.api.catchUpTimelineGap()).toBe("rate_limited");
    expect(peekMessengerRoomTimelineGap(ROOM)).toBe(uuid(1));
  });

  it("gap registered for another room is ignored", async () => {
    const h = harness([msg(1)], () => ({ status: 200, body: { ok: true, messages: [] } }));
    noteMessengerRoomTimelineGap("b4b49e55-a95f-4872-88a5-cc309f3d9814", uuid(1), msg(1).createdAt, { notify: false });
    expect(await h.api.catchUpTimelineGap("b4b49e55-a95f-4872-88a5-cc309f3d9814")).toBe("none");
    expect(h.calls).toHaveLength(0);
  });
});

describe("bump catch-up request budget", () => {
  it("normal bump (no gap): single GET only — no extra after=", async () => {
    const h = harness([msg(1)], (url) =>
      isSingle(url) ? { status: 200, body: { ok: true, message: msg(2) } } : { status: 200, body: { ok: true, messages: [] } }
    );
    await h.api.catchUpAfterRemoteBump(uuid(2));
    expect(h.calls.filter(isSingle)).toHaveLength(1);
    expect(h.afterAnchors()).toEqual([]);
  });

  it("dropped earlier bump (gap registered) → this bump also fills from the pre-burst anchor", async () => {
    const h = harness([msg(1)], (url) => {
      if (isSingle(url)) return { status: 200, body: { ok: true, message: msg(3) } };
      return afterOf(url) === uuid(1)
        ? { status: 200, body: { ok: true, messages: [msg(2), msg(3)], hasMore: false } }
        : { status: 200, body: { ok: true, messages: [] } };
    });
    noteMessengerRoomTimelineGap(ROOM, uuid(1), msg(1).createdAt, { notify: false });
    await h.api.catchUpAfterRemoteBump(uuid(3));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(h.afterAnchors()).toEqual([uuid(1)]);
    expect(h.rows().map((m) => m.id)).toEqual(expect.arrayContaining([uuid(2), uuid(3)]));
    expect(peekMessengerRoomTimelineGap(ROOM)).toBeNull();
  });
});

import { createRoomBumpBurstGapTracker } from "@/lib/community-messenger/room/room-bump-burst-gap";

describe("room bump burst → gap only when a bump is dropped", () => {
  function tracker(rows: () => Array<CommunityMessengerMessage & { pending?: boolean }>) {
    const notes: Array<[string, string]> = [];
    const t = createRoomBumpBurstGapTracker({
      getMessages: rows,
      getRoomId: () => ROOM,
      noteGap: (rid, aid) => {
        notes.push([rid, aid]);
        return true;
      },
    });
    return { t, notes };
  }

  it("single bump per burst → no gap registered", () => {
    const { t, notes } = tracker(() => [msg(1), msg(2)]);
    t.onBumpReceived();
    t.endBurst();
    t.onBumpReceived();
    t.endBurst();
    expect(notes).toEqual([]);
  });

  it("dropped bump → gap at the newest confirmed row seen at burst start (pending ignored)", () => {
    let rows: Array<CommunityMessengerMessage & { pending?: boolean }> = [msg(1), msg(2), { ...msg(9), pending: true }];
    const { t, notes } = tracker(() => rows);
    t.onBumpReceived();
    /** later bump's snapshot merged before the drop is noticed — anchor must stay at burst start */
    rows = [...rows, msg(5)];
    t.onBumpReceived();
    t.onBumpDropped();
    expect(notes).toEqual([[ROOM, uuid(2)]]);
    t.endBurst();
    t.onBumpReceived();
    t.onBumpDropped();
    expect(notes[1]).toEqual([ROOM, uuid(5)]);
  });
});
