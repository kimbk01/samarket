// @vitest-environment jsdom
/**
 * 2026-11-27 — 그룹방 「읽은 수」 다시 조회는 읽음에 관계된 사건에서만.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/messenger-refetch-amplification-2026-11-27.md §3
 * 이전: 방 상태 객체가 바뀔 때마다 조회(운영 메시지 22건에 124번).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type BusEv = { type: string; roomId: string };
const busHandlers = new Set<(ev: BusEv) => void>();
vi.mock("@/lib/community-messenger/multi-tab-bus", () => ({
  onCommunityMessengerBusEvent: (h: (ev: BusEv) => void) => {
    busHandlers.add(h);
    return () => busHandlers.delete(h);
  },
}));
const resyncHandlers = new Set<() => void>();
vi.mock("@/lib/community-messenger/realtime/messenger-realtime-resync", () => ({
  onMessengerRealtimeResynced: (cb: () => void) => {
    resyncHandlers.add(cb);
    return () => resyncHandlers.delete(cb);
  },
}));
vi.mock("@/lib/community-messenger/stores/messenger-realtime-store", () => ({
  normalizeMessengerRealtimeRoomId: (id: string) => String(id ?? "").trim().toLowerCase(),
}));

import {
  GROUP_READ_COUNTS_READ_EVENT_COALESCE_MS,
  useGroupMessageReadCounts,
} from "@/lib/community-messenger/group/use-group-message-read-counts";

const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ ok: true, readCounts: {} }),
}));

let root: Root;
let host: HTMLDivElement;

function Probe(props: { roomId: string; ids: string[]; enabled: boolean; peerKey?: string }) {
  useGroupMessageReadCounts(props.roomId, props.ids, props.enabled, props.peerKey ?? "");
  return null;
}

async function render(props: { roomId: string; ids: string[]; enabled: boolean; peerKey?: string }) {
  await act(async () => {
    root.render(<Probe {...props} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const M1 = "11111111-1111-4111-8111-111111111111";
const M2 = "22222222-2222-4222-8222-222222222222";

const emitRead = (roomId: string) => {
  for (const h of [...busHandlers]) h({ type: "cm.room.peer_read_ack", roomId });
};

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockClear();
  busHandlers.clear();
  resyncHandlers.clear();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

async function flushCoalesce() {
  await act(async () => {
    vi.advanceTimersByTime(GROUP_READ_COUNTS_READ_EVENT_COALESCE_MS + 1);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("그룹 읽은 수 다시 조회", () => {
  it("입장 1번 · 같은 id 의 새 배열(방 상태 교체)로는 다시 묻지 않는다", async () => {
    await render({ roomId: "ROOM-1", ids: [M1, M2], enabled: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await render({ roomId: "ROOM-1", ids: [M1, M2], enabled: true });
    await render({ roomId: "ROOM-1", ids: [M1, M2], enabled: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("내 메시지 id 가 바뀌면 1번", async () => {
    await render({ roomId: "ROOM-1", ids: [M1], enabled: true });
    await render({ roomId: "ROOM-1", ids: [M1, M2], enabled: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("이 방 읽음 사건 여러 번이 가까우면 1번 · 다른 방 사건은 0번", async () => {
    await render({ roomId: "ROOM-1", ids: [M1], enabled: true });
    fetchMock.mockClear();
    emitRead("room-1");
    emitRead("ROOM-1");
    emitRead("room-2");
    await flushCoalesce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    emitRead("room-2");
    await flushCoalesce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("실시간 재연결 묶음이면 1번", async () => {
    await render({ roomId: "ROOM-1", ids: [M1], enabled: true });
    fetchMock.mockClear();
    for (const cb of [...resyncHandlers]) cb();
    await flushCoalesce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("그룹방이 아니면(꺼짐) 조회·구독 없음", async () => {
    await render({ roomId: "ROOM-1", ids: [M1], enabled: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(busHandlers.size).toBe(0);
  });

  it("조회는 /media POST 에 내 메시지 id 를 보낸다", async () => {
    await render({ roomId: "ROOM-1", ids: [M1, M2], enabled: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/media$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).messageIds).toEqual([M1, M2]);
  });

  it("다른 멤버 새 메시지(답장 — 읽음 사건 없음)·멤버 수 변경이면 모아서 1번", async () => {
    await render({ roomId: "ROOM-1", ids: [M1], enabled: true, peerKey: "p1|3" });
    fetchMock.mockClear();
    await render({ roomId: "ROOM-1", ids: [M1], enabled: true, peerKey: "p2|3" });
    await render({ roomId: "ROOM-1", ids: [M1], enabled: true, peerKey: "p2|4" });
    await flushCoalesce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await render({ roomId: "ROOM-1", ids: [M1], enabled: true, peerKey: "p2|4" });
    await flushCoalesce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
