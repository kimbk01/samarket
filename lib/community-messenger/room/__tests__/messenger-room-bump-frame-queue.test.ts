import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => null }));
vi.mock("@/lib/community-messenger/stores/messenger-realtime-store", () => ({
  applyIncomingMessageEvent: vi.fn(),
}));
vi.mock("@/lib/community-messenger/realtime/global-messenger-room-bundle-channel", () => ({
  isOpenRoomTerminalCatchUpPendingForRoom: () => false,
}));

import {
  createRoomBumpFrameQueue,
  createRoomBumpResubscribeStatusTracker,
  mergeBumpCatchUpRequests,
  primaryHintOfBumpCatchUpRequest,
} from "@/lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription";
import {
  createMessengerRoomRemoteCatchup,
  resetMessengerRoomRemoteCatchupStateForTests,
} from "@/lib/community-messenger/room/use-messenger-room-remote-catchup";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

function fakeFrames() {
  const frames = new Map<number, () => void>();
  let seq = 0;
  const timers: Array<() => void> = [];
  return {
    requestFrame: (cb: () => void) => {
      seq += 1;
      frames.set(seq, cb);
      return seq;
    },
    cancelFrame: vi.fn((id: number) => {
      frames.delete(id);
    }),
    setTimer: (cb: () => void) => {
      timers.push(cb);
      return timers.length;
    },
    clearTimer: () => undefined,
    runFrames: () => {
      const cbs = [...frames.values()];
      frames.clear();
      for (const cb of cbs) cb();
    },
    runTimers: () => {
      const cbs = timers.splice(0);
      for (const cb of cbs) cb();
    },
    frameCount: () => frames.size,
  };
}

describe("M-3 frame queue — earlier bumps are never dropped", () => {
  it("two bumps in the same frame flush together once (no rAF cancel)", () => {
    const f = fakeFrames();
    const flushed: number[][] = [];
    const q = createRoomBumpFrameQueue<number>({
      flush: (items) => flushed.push(items),
      isDocumentHidden: () => false,
      ...f,
    });
    q.push(1);
    q.push(2);
    expect(f.frameCount()).toBe(1);
    expect(f.cancelFrame).not.toHaveBeenCalled();
    f.runFrames();
    expect(flushed).toEqual([[1, 2]]);
  });

  it("hidden document (rAF paused) flushes via setTimeout(0)", () => {
    const f = fakeFrames();
    const flushed: number[][] = [];
    const q = createRoomBumpFrameQueue<number>({
      flush: (items) => flushed.push(items),
      isDocumentHidden: () => true,
      ...f,
    });
    q.push(1);
    q.push(2);
    expect(f.frameCount()).toBe(0);
    f.runTimers();
    expect(flushed).toEqual([[1, 2]]);
  });

  it("going hidden while a frame is pending moves the flush to a timer", () => {
    const f = fakeFrames();
    const flushed: number[][] = [];
    const q = createRoomBumpFrameQueue<number>({ flush: (items) => flushed.push(items), isDocumentHidden: () => false, ...f });
    q.push(1);
    q.onHidden();
    f.runTimers();
    expect(flushed).toEqual([[1]]);
    f.runFrames();
    expect(flushed).toEqual([[1]]);
  });

  it("hints accumulate into a set (no overwrite); unmerged hint preferred for the single GET", () => {
    const a = { hints: ["m1"], unmergedHints: ["m1"], allMergedSnapshot: false, bumpCount: 1 };
    const b = { hints: ["m2", "m2"], unmergedHints: [], allMergedSnapshot: true, bumpCount: 2 };
    const merged = mergeBumpCatchUpRequests(mergeBumpCatchUpRequests(null, a), b);
    expect(merged.hints).toEqual(["m1", "m2"]);
    expect(merged.allMergedSnapshot).toBe(false);
    expect(merged.bumpCount).toBe(3);
    expect(primaryHintOfBumpCatchUpRequest(merged)).toBe("m1");
    expect(primaryHintOfBumpCatchUpRequest(b)).toBe("m2");
  });

  it("hook source no longer cancels the pending rAF on each bump", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/cancelAnimationFrame\(remoteBumpCatchUpRafRef\.current\)/);
    expect(src).toContain("frameQueue.push({ payload, hint, ownDecision })");
    expect(src).toContain("coalescedBumpCount: req.bumpCount");
    /** M-5: primitive deps */
    expect(src).toContain("}, [bumpSubscribeIdsKey, roomId, roomReadyForRealtime, streamRoomId, viewer]);");
  });
});

describe("M-5 re-SUBSCRIBED detection", () => {
  it("first SUBSCRIBED is bind; later SUBSCRIBED triggers one resume per rejoin", () => {
    const seen: string[] = [];
    const track = createRoomBumpResubscribeStatusTracker("r1", (rid) => seen.push(rid));
    track("SUBSCRIBED");
    expect(seen).toEqual([]);
    track("CHANNEL_ERROR");
    track("SUBSCRIBED");
    track("TIMED_OUT");
    track("SUBSCRIBED");
    expect(seen).toEqual(["r1", "r1"]);
  });
});

const ROOM = "a4b49e55-a95f-4872-88a5-cc309f3d9814";
const VIEWER = "11111111-1111-4111-8111-111111111111";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const msg = (n: number): CommunityMessengerMessage => ({
  id: uuid(n),
  roomId: ROOM,
  senderId: VIEWER,
  senderLabel: "p",
  messageType: "text",
  content: `m${n}`,
  createdAt: `2026-10-01T00:00:${String(n).padStart(2, "0")}.000Z`,
  isMine: false,
});

function harness(initial: CommunityMessengerMessage[]) {
  const calls: string[] = [];
  let rows: CommunityMessengerMessage[] = [...initial];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (/\/messages\/[0-9a-f-]{36}$/.test(url)) {
      return new Response(JSON.stringify({ ok: true, message: msg(5) }), { status: 200 });
    }
    if (/[?&]after=/.test(url)) {
      return new Response(JSON.stringify({ ok: true, messages: [msg(4)], hasMore: false }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true, messages: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  const refresh = vi.fn(async () => undefined);
  const api = createMessengerRoomRemoteCatchup({
    roomId: ROOM,
    streamRoomId: ROOM,
    refresh,
    snapshotRef: { current: { viewerUserId: VIEWER, room: { id: ROOM } } as unknown as CommunityMessengerRoomSnapshot },
    roomMessagesRef: {
      get current() {
        return rows;
      },
    },
    setRoomMessages: (next) => {
      rows = typeof next === "function" ? (next(rows) as CommunityMessengerMessage[]) : next;
    },
    fetchImpl,
    sleep: async () => undefined,
    setTimer: () => 0,
  });
  return {
    api,
    refresh,
    rows: () => rows,
    singleGets: () => calls.filter((c) => /\/messages\/[0-9a-f-]{36}$/.test(c)).length,
    afterGets: () => calls.filter((c) => /[?&]after=/.test(c)).length,
  };
}

describe("M-3 remote catch-up with coalesced bumps", () => {
  beforeEach(() => resetMessengerRoomRemoteCatchupStateForTests());

  it("single bump: single GET only (no extra after=)", async () => {
    const h = harness([msg(1)]);
    await h.api.catchUpAfterRemoteBump(uuid(5), { coalescedBumpCount: 1 });
    expect(h.singleGets()).toBe(1);
    expect(h.afterGets()).toBe(0);
  });

  it("≥2 coalesced bumps: single GET success then one after= picks up the other INSERT", async () => {
    const h = harness([msg(1)]);
    await h.api.catchUpAfterRemoteBump(uuid(5), { coalescedBumpCount: 2 });
    expect(h.singleGets()).toBe(1);
    expect(h.afterGets()).toBe(1);
    const ids = h.rows().map((m) => m.id);
    expect(ids).toContain(uuid(4));
    expect(ids).toContain(uuid(5));
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
