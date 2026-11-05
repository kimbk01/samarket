/**
 * 메신저 방 catch-up 조회 마감 — 멈춘 요청은 마감 뒤 기존 실패 결과(`failed`)로 끝나 공유 키가 풀리고,
 * 다음 catch-up 은 새 요청을 보낸다. 정상 병합(통화 기록 행 포함)·순서·중복 제거는 그대로.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const ctl = { stall: false, body: { ok: true, messages: [] as CommunityMessengerMessage[], hasMore: false } };

function harness(initial: CommunityMessengerMessage[]) {
  const calls: string[] = [];
  let rows: Array<CommunityMessengerMessage & { pending?: boolean }> = [...initial];
  const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    if (ctl.stall) {
      return new Promise<Response>((_, rej) =>
        init?.signal?.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")))
      );
    }
    return Promise.resolve(new Response(JSON.stringify(ctl.body), { status: 200 }));
  }) as unknown as typeof fetch;
  const make = () =>
    createMessengerRoomRemoteCatchup({
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
  return { make, calls, rows: () => rows };
}

function track<T>(p: Promise<T>): { state: "pending" | "done"; value?: T } {
  const o: { state: "pending" | "done"; value?: T } = { state: "pending" };
  void p.then((v) => {
    o.state = "done";
    o.value = v;
  });
  return o;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetMessengerRoomRemoteCatchupStateForTests();
  ctl.stall = false;
  ctl.body = { ok: true, messages: [], hasMore: false };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("catch-up 마감", () => {
  it("after= 멈춤: 마감 뒤 failed · 재진입(새 인스턴스) catch-up 은 새 요청으로 병합", async () => {
    const h = harness([msg(1)]);
    ctl.stall = true;
    const o = track(h.make().catchUpNewerMessagesOutcome());
    await vi.advanceTimersByTimeAsync(12_050);
    expect(o).toMatchObject({ state: "done", value: "failed" });
    expect(h.calls.length).toBe(1);
    ctl.stall = false;
    ctl.body = { ok: true, messages: [msg(2)], hasMore: false };
    const o2 = track(h.make().catchUpNewerMessagesOutcome());
    await vi.advanceTimersByTimeAsync(100);
    expect(o2).toMatchObject({ state: "done", value: "merged" });
    expect(h.calls.length).toBe(2);
    expect(h.rows().map((m) => m.id)).toEqual([uuid(1), uuid(2)]);
  });

  it("latest= 멈춤(앵커 없음): 마감 뒤 failed · 다음 요청은 새로 보낸다", async () => {
    const h = harness([]);
    ctl.stall = true;
    const o = track(h.make().catchUpNewerMessagesOutcome());
    await vi.advanceTimersByTimeAsync(12_050);
    expect(o).toMatchObject({ state: "done", value: "failed" });
    ctl.stall = false;
    const o2 = track(h.make().catchUpNewerMessagesOutcome());
    await vi.advanceTimersByTimeAsync(100);
    expect(o2).toMatchObject({ state: "done", value: "none" });
    expect(h.calls.length).toBe(2);
  });
});

describe("catch-up 정상 경로 보존", () => {
  it("통화 기록 행 포함 병합 · 순서 · 중복 제거 유지", async () => {
    const call = msg(3, { messageType: "call_stub" as CommunityMessengerMessage["messageType"], content: "voice" });
    const h = harness([msg(1), msg(2)]);
    ctl.body = { ok: true, messages: [msg(2), call, msg(4)], hasMore: false };
    const o = track(h.make().catchUpNewerMessagesOutcome());
    await vi.advanceTimersByTimeAsync(100);
    expect(o).toMatchObject({ state: "done", value: "merged" });
    expect(h.rows().map((m) => m.id)).toEqual([uuid(1), uuid(2), uuid(3), uuid(4)]);
    expect(h.rows().find((m) => m.id === uuid(3))?.messageType).toBe("call_stub");
  });

  it("동시 catch-up 은 요청 1회 공유", async () => {
    const h = harness([msg(1)]);
    const api = h.make();
    const a = track(api.catchUpNewerMessagesOutcome());
    const b = track(api.catchUpNewerMessagesOutcome());
    await vi.advanceTimersByTimeAsync(100);
    expect(a.state).toBe("done");
    expect(b.state).toBe("done");
    expect(h.calls.length).toBe(1);
  });
});
