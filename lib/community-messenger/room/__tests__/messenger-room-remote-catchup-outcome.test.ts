import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/stores/messenger-realtime-store", () => ({
  applyIncomingMessageEvent: vi.fn(),
}));
vi.mock("@/lib/community-messenger/realtime/global-messenger-room-bundle-channel", () => ({
  isOpenRoomTerminalCatchUpPendingForRoom: () => false,
}));

import {
  createMessengerRoomRemoteCatchup,
  resetMessengerRoomRemoteCatchupStateForTests,
} from "@/lib/community-messenger/room/use-messenger-room-remote-catchup";
import { runMessengerRoomVisibilityResumeCatchup } from "@/lib/community-messenger/room/use-messenger-room-visibility-bus-catchup";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

const ROOM = "a4b49e55-a95f-4872-88a5-cc309f3d9814";
const VIEWER = "11111111-1111-4111-8111-111111111111";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function msg(n: number, extra?: Partial<CommunityMessengerMessage>): CommunityMessengerMessage {
  return {
    id: uuid(n),
    roomId: ROOM,
    senderId: VIEWER,
    senderLabel: "me",
    messageType: "text",
    content: `m${n}`,
    createdAt: `2026-10-01T00:00:${String(n).padStart(2, "0")}.000Z`,
    isMine: true,
    ...extra,
  };
}

type Route = (url: string) => { status: number; body?: unknown; headers?: Record<string, string> };

function harness(initial: CommunityMessengerMessage[], route: Route) {
  const calls: string[] = [];
  let rows: Array<CommunityMessengerMessage & { pending?: boolean }> = [...initial];
  const roomMessagesRef = {
    get current() {
      return rows;
    },
  };
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const refresh = vi.fn(async () => undefined);
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const r = route(url);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: r.headers });
  }) as unknown as typeof fetch;
  const api = createMessengerRoomRemoteCatchup({
    roomId: ROOM,
    streamRoomId: ROOM,
    refresh,
    snapshotRef: {
      current: { viewerUserId: VIEWER, room: { id: ROOM } } as unknown as CommunityMessengerRoomSnapshot,
    },
    roomMessagesRef,
    setRoomMessages: (next) => {
      rows = typeof next === "function" ? next(rows) : next;
    },
    fetchImpl,
    sleep: async () => undefined,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
  });
  const count = (re: RegExp) => calls.filter((c) => re.test(c)).length;
  return {
    api,
    calls,
    refresh,
    timers,
    rows: () => rows,
    singleGets: () => count(/\/messages\/[0-9a-f-]{36}$/),
    afterGets: () => count(/[?&]after=/),
    latestGets: () => count(/[?&]latest=1/),
  };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  resetMessengerRoomRemoteCatchupStateForTests();
});

describe("C-4 bump catch-up: 429 backs off (no after= storm, no refresh)", () => {
  it("429 on messages/{id} with snapshot already merged → nothing else (no after=, no refresh, no timer)", async () => {
    const h = harness([msg(1), msg(2)], (url) => (/\/messages\/[0-9a-f-]{36}$/.test(url) ? { status: 429 } : { status: 500 }));
    await h.api.catchUpAfterRemoteBump(uuid(2), { alreadyMergedSnapshot: true });
    expect(h.singleGets()).toBe(1);
    expect(h.afterGets()).toBe(0);
    expect(h.refresh).not.toHaveBeenCalled();
    expect(h.timers).toHaveLength(0);
  });

  it("429 without snapshot → one deferred reconcile honoring Retry-After; deferred 429 stops (bounded)", async () => {
    const h = harness([msg(1)], (url) =>
      /\/messages\/[0-9a-f-]{36}$/.test(url) ? { status: 429, headers: { "retry-after": "7" } } : { status: 200, body: { ok: true, messages: [] } }
    );
    await h.api.catchUpAfterRemoteBump(uuid(2));
    await h.api.catchUpAfterRemoteBump(uuid(3));
    expect(h.refresh).not.toHaveBeenCalled();
    expect(h.afterGets()).toBe(0);
    /** coalesced: one timer per room, hints accumulated */
    expect(h.timers).toHaveLength(1);
    expect(h.timers[0].ms).toBe(7000);
    h.timers[0].fn();
    await flush();
    /** first deferred hint hits 429 again → stop; no re-schedule, no refresh */
    expect(h.timers).toHaveLength(1);
    expect(h.refresh).not.toHaveBeenCalled();
    expect(h.singleGets()).toBe(3);
  });

  it("deferred reconcile merges the edited row by id once the limit clears", async () => {
    let limited = true;
    const edited = msg(1, { content: "edited" });
    const h = harness([msg(1)], (url) => {
      if (/\/messages\/[0-9a-f-]{36}$/.test(url)) {
        return limited ? { status: 429 } : { status: 200, body: { ok: true, message: edited } };
      }
      return { status: 200, body: { ok: true, messages: [] } };
    });
    await h.api.catchUpAfterRemoteBump(uuid(1));
    limited = false;
    h.timers[0].fn();
    await flush();
    expect(h.rows().find((m) => m.id === uuid(1))?.content).toBe("edited");
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("single GET miss + empty after= with snapshot already merged → success (no refresh, single after=)", async () => {
    const h = harness([msg(1), msg(2)], (url) =>
      /\/messages\/[0-9a-f-]{36}$/.test(url) ? { status: 400, body: { ok: false } } : { status: 200, body: { ok: true, messages: [] } }
    );
    await h.api.catchUpAfterRemoteBump(uuid(2), { alreadyMergedSnapshot: true });
    expect(h.afterGets()).toBe(1);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("without snapshot, empty after= keeps the bounded retry → silent refresh fallback (preserved)", async () => {
    const h = harness([msg(1)], (url) =>
      /\/messages\/[0-9a-f-]{36}$/.test(url) ? { status: 400, body: { ok: false } } : { status: 200, body: { ok: true, messages: [] } }
    );
    await h.api.catchUpAfterRemoteBump(uuid(2));
    expect(h.afterGets()).toBe(3);
    expect(h.refresh).toHaveBeenCalledWith(true, { triggerReason: "realtime_bump_catchup" });
  });

  it("429 on after= during bump catch-up → no refresh", async () => {
    const h = harness([msg(1)], () => ({ status: 429 }));
    await h.api.catchUpAfterRemoteBump(null, { alreadyMergedSnapshot: true });
    expect(h.afterGets()).toBe(1);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("single GET success keeps the per-bump messages/{id} reconcile", async () => {
    const h = harness([msg(1)], (url) =>
      /\/messages\/[0-9a-f-]{36}$/.test(url) ? { status: 200, body: { ok: true, message: msg(2) } } : { status: 500 }
    );
    await h.api.catchUpAfterRemoteBump(uuid(2), { alreadyMergedSnapshot: true });
    expect(h.singleGets()).toBe(1);
    expect(h.afterGets()).toBe(0);
    expect(h.rows().map((m) => m.id)).toContain(uuid(2));
  });
});

describe("C-9 after= anchor hidden/deleted (404 not_found) → latest reconcile, not refresh loop", () => {
  it("falls back to latest and stops using the bad anchor", async () => {
    const h = harness([msg(1), msg(2)], (url) => {
      if (url.includes(`after=${encodeURIComponent(uuid(2))}`)) {
        return { status: 404, body: { ok: false, error: "x", code: "not_found" } };
      }
      if (/latest=1/.test(url)) return { status: 200, body: { ok: true, messages: [msg(1), msg(3)] } };
      return { status: 200, body: { ok: true, messages: [] } };
    });
    const first = await h.api.catchUpNewerMessagesOutcome();
    expect(first).toBe("merged");
    expect(h.latestGets()).toBe(1);
    await h.api.catchUpAfterRemoteBump(null, { alreadyMergedSnapshot: true });
    expect(h.refresh).not.toHaveBeenCalled();
    /** second round anchors on uuid(3) (newest usable), never re-requests the hidden anchor */
    expect(h.calls.filter((c) => c.includes(`after=${encodeURIComponent(uuid(2))}`))).toHaveLength(1);
  });

  it("room_not_found 404 is a plain failure (not anchor exclusion)", async () => {
    const h = harness([msg(1)], () => ({ status: 404, body: { ok: false, code: "room_not_found" } }));
    expect(await h.api.catchUpNewerMessagesOutcome()).toBe("failed");
    expect(h.latestGets()).toBe(0);
  });
});

describe("C-7 visibility resume", () => {
  it("empty room: latest is requested once (shared single-flight), not twice", async () => {
    const h = harness([], () => ({ status: 200, body: { ok: true, messages: [] } }));
    await runMessengerRoomVisibilityResumeCatchup({
      catchUpNewerMessages: h.api.catchUpNewerMessages,
      reconcileLatestMessages: h.api.reconcileLatestMessages,
      refresh: h.refresh,
    });
    await flush();
    expect(h.latestGets()).toBe(1);
  });

  it("non-empty room: one after= + one latest; nothing new → silent_delta refresh only (read/call state)", async () => {
    const h = harness([msg(1)], () => ({ status: 200, body: { ok: true, messages: [] } }));
    await runMessengerRoomVisibilityResumeCatchup({
      catchUpNewerMessages: h.api.catchUpNewerMessages,
      reconcileLatestMessages: h.api.reconcileLatestMessages,
      refresh: h.refresh,
    });
    await flush();
    expect(h.afterGets()).toBe(1);
    expect(h.latestGets()).toBe(1);
    expect(h.refresh).toHaveBeenCalledWith(true, { triggerReason: "visibilitychange" });
  });

  it("catchUpNewerMessagesOutcome distinguishes none from failed", async () => {
    const ok = harness([msg(1)], () => ({ status: 200, body: { ok: true, messages: [] } }));
    expect(await ok.api.catchUpNewerMessagesOutcome()).toBe("none");
    const bad = harness([msg(1)], () => ({ status: 503 }));
    expect(await bad.api.catchUpNewerMessagesOutcome()).toBe("failed");
    const limited = harness([msg(1)], () => ({ status: 429 }));
    expect(await limited.api.catchUpNewerMessagesOutcome()).toBe("rate_limited");
  });
});
