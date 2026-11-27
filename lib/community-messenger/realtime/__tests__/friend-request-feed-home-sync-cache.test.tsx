// @vitest-environment jsdom
/**
 * 2026-11-27 — 메신저 홈이 열릴 때 보내는 동기화 요청은, 실시간 채널이 연결돼 있으면 마지막 목록을 다시 알리고 서버를 다시 묻지 않는다.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/messenger-refetch-amplification-2026-11-27.md §2
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let onStatus: ((s: string) => void) | null = null;
vi.mock("@/lib/community-messenger/realtime/messenger-realtime-supervisor", () => ({
  superviseMessengerChannel: (args: { onStatus: (s: string) => void }) => {
    onStatus = args.onStatus;
    return { stop: () => undefined };
  },
}));
vi.mock("@/lib/community-messenger/realtime/messenger-realtime-resync", () => ({
  noteMessengerRealtimeResubscribed: () => undefined,
  onMessengerRealtimeResynced: () => () => undefined,
}));
vi.mock("@/lib/community-messenger/realtime/resume-resync-gate", () => ({
  ensureResumeVisibilityClock: () => undefined,
  scheduleResumeRefetch: () => () => undefined,
  shouldRefetchOnAppResume: () => false,
}));
vi.mock("@/lib/community-messenger/realtime/private-broadcast-client", () => ({
  messengerPrivateBroadcastChannelOptions: () => ({}),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@/lib/community-messenger/friend-request-change-event", () => ({ notifyFriendRequestChanged: () => undefined }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "me-1" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

import {
  CM_FRIEND_REQUESTS_SYNCED_EVENT,
  CM_FRIEND_REQUESTS_SYNC_REQUEST_EVENT,
  useGlobalFriendRequestFeed,
} from "@/lib/community-messenger/realtime/use-global-friend-request-feed";

const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({
    ok: true,
    requests: [{ id: "r1", status: "pending", direction: "incoming", requesterId: "u2", requesterLabel: "A", createdAt: "x" }],
  }),
}));

let root: Root;
let host: HTMLDivElement;
let synced: number;
const onSynced = () => {
  synced += 1;
};

function Probe() {
  useGlobalFriendRequestFeed({ enabled: true, onAcceptedByPeer: () => undefined });
  return null;
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(async () => {
  fetchMock.mockClear();
  onStatus = null;
  synced = 0;
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  window.addEventListener(CM_FRIEND_REQUESTS_SYNCED_EVENT, onSynced);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await flush();
});

afterEach(async () => {
  window.removeEventListener(CM_FRIEND_REQUESTS_SYNCED_EVENT, onSynced);
  await act(async () => root.unmount());
  host.remove();
});

describe("홈 동기화 요청", () => {
  it("채널 연결 + 받은 목록 있음 → 서버 다시 안 묻고 목록을 다시 알림", async () => {
    expect(fetchMock).toHaveBeenCalledTimes(1); // 시작
    await act(async () => onStatus?.("SUBSCRIBED"));
    await flush();
    const afterSubscribe = fetchMock.mock.calls.length;
    const syncedBefore = synced;
    await act(async () => {
      window.dispatchEvent(new Event(CM_FRIEND_REQUESTS_SYNC_REQUEST_EVENT));
    });
    await flush();
    expect(fetchMock.mock.calls.length).toBe(afterSubscribe);
    expect(synced).toBe(syncedBefore + 1);
  });

  it("채널이 끊겼으면 서버를 다시 묻는다", async () => {
    await act(async () => onStatus?.("SUBSCRIBED"));
    await flush();
    await act(async () => onStatus?.("CHANNEL_ERROR"));
    const before = fetchMock.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new Event(CM_FRIEND_REQUESTS_SYNC_REQUEST_EVENT));
    });
    await flush();
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });

  it("아직 한 번도 연결 안 됐으면 서버를 묻는다", async () => {
    const before = fetchMock.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new Event(CM_FRIEND_REQUESTS_SYNC_REQUEST_EVENT));
    });
    await flush();
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });

  it("다시 연결(재연결 동기화 조회 전)이면 서버를 묻는다", async () => {
    await act(async () => onStatus?.("SUBSCRIBED"));
    await flush();
    await act(async () => onStatus?.("CHANNEL_ERROR"));
    await act(async () => onStatus?.("SUBSCRIBED"));
    const before = fetchMock.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new Event(CM_FRIEND_REQUESTS_SYNC_REQUEST_EVENT));
    });
    await flush();
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });

  it("연결 뒤 조회가 실패했으면 받은 목록을 쓰지 않고 서버를 묻는다", async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({}) }) as never);
    await act(async () => onStatus?.("SUBSCRIBED"));
    await flush();
    const before = fetchMock.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new Event(CM_FRIEND_REQUESTS_SYNC_REQUEST_EVENT));
    });
    await flush();
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });
});
