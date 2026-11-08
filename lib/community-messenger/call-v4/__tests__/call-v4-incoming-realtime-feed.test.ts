/** @vitest-environment jsdom */
/**
 * U2 (Owner 「U2 승인」 2026-11-08) — V4 웹 수신 Realtime 피드.
 * K3: 공용 holder·레지스트리는 첫 생성자 핸들러만 붙인다 → 이 피드는 리스너 fan-out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type BuiltHandler = (payload: unknown) => void;
const captured: {
  build: ((ch: unknown) => unknown) | null;
  onStatus: ((s: string) => void) | null;
  name: string | null;
  channelOptions: unknown;
  stop: ReturnType<typeof vi.fn>;
  handler: BuiltHandler | null;
  filter: unknown;
  subscribeCount: number;
} = { build: null, onStatus: null, name: null, channelOptions: null, stop: vi.fn(), handler: null, filter: null, subscribeCount: 0 };

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn(() => ({})) }));
vi.mock("@/lib/community-messenger/realtime/subscribe-with-retry", () => ({
  subscribeWithRetry: vi.fn((args: { build: (ch: unknown) => unknown; onStatus: (s: string) => void; name: string; channelOptions: unknown }) => {
    captured.subscribeCount += 1;
    captured.build = args.build;
    captured.onStatus = args.onStatus;
    captured.name = args.name;
    captured.channelOptions = args.channelOptions;
    const fakeChannel = {
      on: (_type: string, filter: unknown, handler: BuiltHandler) => {
        captured.filter = filter;
        captured.handler = handler;
        return fakeChannel;
      },
    };
    args.build(fakeChannel);
    return { channel: fakeChannel, stop: captured.stop, markSignal: () => {} };
  }),
}));

import { getSupabaseClient } from "@/lib/supabase/client";
import {
  __resetCallV4IncomingRealtimeFeedForTests,
  acquireCallV4IncomingRealtimeFeed,
  readCallV4IncomingRingingFromPayload,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-realtime-feed";

const UID = "11111111-1111-1111-1111-111111111111";
const ringingInsert = {
  eventType: "INSERT",
  new: { id: "call-1", status: "ringing", session_mode: "direct", recipient_user_id: UID, started_at: "2026-11-08T12:00:00Z" },
};

beforeEach(() => {
  __resetCallV4IncomingRealtimeFeedForTests();
  captured.build = null;
  captured.onStatus = null;
  captured.handler = null;
  captured.subscribeCount = 0;
  captured.stop = vi.fn();
  vi.mocked(getSupabaseClient).mockReturnValue({} as never);
});

describe("readCallV4IncomingRingingFromPayload", () => {
  it("나에게 온 1:1 ringing 만 꺼낸다", () => {
    expect(readCallV4IncomingRingingFromPayload(ringingInsert, UID)).toEqual({
      callId: "call-1",
      startedAt: "2026-11-08T12:00:00Z",
    });
  });
  it("종료 UPDATE(cancelled/missed/ended/rejected)는 전달하지 않는다", () => {
    for (const status of ["cancelled", "missed", "ended", "rejected", "active"]) {
      expect(readCallV4IncomingRingingFromPayload({ new: { ...ringingInsert.new, status } }, UID)).toBeNull();
    }
  });
  it("다른 수신자·그룹·DELETE(new 없음)는 무시한다", () => {
    expect(readCallV4IncomingRingingFromPayload({ new: { ...ringingInsert.new, recipient_user_id: "other" } }, UID)).toBeNull();
    expect(readCallV4IncomingRingingFromPayload({ new: { ...ringingInsert.new, session_mode: "group" } }, UID)).toBeNull();
    expect(readCallV4IncomingRingingFromPayload({ eventType: "DELETE", new: {}, old: { id: "x" } }, UID)).toBeNull();
    expect(readCallV4IncomingRingingFromPayload(null, UID)).toBeNull();
  });
});

describe("acquireCallV4IncomingRealtimeFeed", () => {
  it("Legacy 와 같은 채널·private 옵션·recipient 필터로 구독한다", () => {
    acquireCallV4IncomingRealtimeFeed(UID, { onRinging: () => {} });
    expect(captured.name).toBe(`community-messenger-incoming-call:${UID}`);
    expect(captured.channelOptions).toMatchObject({ config: { private: true } });
    expect(captured.filter).toEqual({
      event: "*",
      schema: "public",
      table: "community_messenger_call_sessions",
      filter: `recipient_user_id=eq.${UID}`,
    });
  });

  it("같은 사용자 리스너가 여럿이어도 채널은 1개이고 모든 리스너가 이벤트·상태를 받는다(K3)", () => {
    const a = vi.fn();
    const b = vi.fn();
    const sa = vi.fn();
    const sb = vi.fn();
    acquireCallV4IncomingRealtimeFeed(UID, { onRinging: a, onStatus: sa });
    acquireCallV4IncomingRealtimeFeed(UID, { onRinging: b, onStatus: sb });
    expect(captured.subscribeCount).toBe(1);
    captured.onStatus?.("SUBSCRIBED");
    captured.handler?.(ringingInsert);
    expect(a).toHaveBeenCalledWith({ callId: "call-1", startedAt: "2026-11-08T12:00:00Z" });
    expect(b).toHaveBeenCalledWith({ callId: "call-1", startedAt: "2026-11-08T12:00:00Z" });
    expect(sa).toHaveBeenCalledWith("SUBSCRIBED");
    expect(sb).toHaveBeenCalledWith("SUBSCRIBED");
  });

  it("늦게 붙은 리스너는 마지막 상태를 바로 받는다", () => {
    acquireCallV4IncomingRealtimeFeed(UID, { onRinging: () => {} });
    captured.onStatus?.("SUBSCRIBED");
    const late = vi.fn();
    acquireCallV4IncomingRealtimeFeed(UID, { onRinging: () => {}, onStatus: late });
    expect(late).toHaveBeenCalledWith("SUBSCRIBED");
  });

  it("한 리스너 오류가 다른 리스너에 번지지 않는다", () => {
    const ok = vi.fn();
    acquireCallV4IncomingRealtimeFeed(UID, { onRinging: () => { throw new Error("boom"); } });
    acquireCallV4IncomingRealtimeFeed(UID, { onRinging: ok });
    expect(() => captured.handler?.(ringingInsert)).not.toThrow();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("마지막 리스너가 빠질 때만 채널을 정리한다", () => {
    const r1 = acquireCallV4IncomingRealtimeFeed(UID, { onRinging: () => {} });
    const r2 = acquireCallV4IncomingRealtimeFeed(UID, { onRinging: () => {} });
    r1();
    expect(captured.stop).not.toHaveBeenCalled();
    r2();
    expect(captured.stop).toHaveBeenCalledTimes(1);
    r2();
    expect(captured.stop).toHaveBeenCalledTimes(1);
  });

  it("Supabase 클라이언트가 없으면 아무것도 하지 않는다(기존 폴링이 수신)", () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    const release = acquireCallV4IncomingRealtimeFeed(UID, { onRinging: () => {} });
    expect(captured.subscribeCount).toBe(0);
    expect(() => release()).not.toThrow();
  });
});
