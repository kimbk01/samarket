/**
 * 결함 2(2026-11-27 iPhone 실기) — 감독 밖이던 실시간 채널 4개를 감독 입구로.
 * 가입 실패 때 라이브러리가 10초마다 끝없이 재가입하던 것(5분 동안 채널당 30회)을 감독 차단기·대기·멈춤에 넣는다.
 * 감독 자체 동작(차단·대기·오프라인)은 `messenger-realtime-supervisor` 시험이 본다 — 여기서는 4개 채널이
 * ① 감독 입구로만 가입하고 ② 재연결 때 R2 재동기화를 부르지 않으며(지금처럼 다시 읽기 없음 — 독립 검토 7번)
 * ③ 해제 뒤 재시도 중단·토픽 해제 기록(빠른 재진입 공백 보상 유지 — 독립 검토 1번) ④ 수신 처리 유지를 본다.
 * 설계 docs/audit/supabase-request-surge-2026-11-18/rt-bundle-gen-skip-and-unsupervised-channels-design-2026-11-27.md §3
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CapturedArgs = {
  name: string;
  scope: string;
  isCancelled: () => boolean;
  onStatus?: (status: string) => void;
  build: (ch: unknown) => unknown;
};

const captured: CapturedArgs[] = [];
const stopped: string[] = [];
const resubscribed = vi.fn();

vi.mock("@/lib/community-messenger/realtime/messenger-realtime-supervisor", () => ({
  superviseMessengerChannel: (args: CapturedArgs) => {
    captured.push(args);
    return { channel: { topic: `realtime:${args.name}` }, stop: () => stopped.push(args.name), markSignal: () => undefined };
  },
}));

vi.mock("@/lib/community-messenger/realtime/messenger-realtime-resync", () => ({
  noteMessengerRealtimeResubscribed: () => resubscribed(),
  onMessengerRealtimeResynced: () => () => undefined,
}));

const fakeSb = {
  realtime: { accessTokenValue: "jwt" },
  getChannels: () => [],
  channel: vi.fn(),
  removeChannel: vi.fn(async () => "ok"),
};

/** `build` 가 붙이는 수신 처리를 잡는 가짜 채널 */
function fakeChannel() {
  const handlers: Array<{ type: string; filter: Record<string, unknown>; cb: (p: unknown) => void }> = [];
  const ch = {
    on(type: string, filter: Record<string, unknown>, cb: (p: unknown) => void) {
      handlers.push({ type, filter, cb });
      return ch;
    },
  };
  return { ch, handlers };
}

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe("결함 2 — 감독 밖 채널 4개를 감독 입구로", () => {
  beforeEach(() => {
    captured.length = 0;
    stopped.length = 0;
    resubscribed.mockClear();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("소스: 4개 파일 모두 superviseMessengerChannel 로 가입하고 직접 .subscribe( 를 부르지 않는다", () => {
    const files = [
      "lib/community-messenger/realtime/home-list-room-insert-broadcast-client.ts",
      "lib/community-messenger/realtime/room-bump-broadcast.ts",
      "lib/community-messenger/realtime/typing/messenger-typing-topic-registry.ts",
      "lib/community-messenger/room/use-messenger-room-friendship-sync.ts",
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, f).toContain("superviseMessengerChannel({");
      expect(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), f).not.toMatch(/\.subscribe\(/);
    }
  });

  it("room-bump: 재연결에도 R2 note 없음 · 상태 전달 · 수신 처리 유지 · 해제 뒤 취소", async () => {
    const { subscribeCommunityMessengerRoomBumpBroadcast } = await import(
      "@/lib/community-messenger/realtime/room-bump-broadcast"
    );
    let cancelled = false;
    const onBump = vi.fn();
    const onStatus = vi.fn();
    const handle = subscribeCommunityMessengerRoomBumpBroadcast({
      sb: fakeSb as never,
      roomId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      onBump,
      onStatus,
      isCancelled: () => cancelled,
    });
    const a = captured.at(-1)!;
    expect(a.name).toBe("community-messenger-room-bump:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(a.scope).toBe("room_bump");
    const { ch, handlers } = fakeChannel();
    a.build(ch);
    expect(handlers).toHaveLength(1);
    handlers[0]!.cb({ payload: { v: 2, roomId: "x" } });
    expect(onBump).toHaveBeenCalledWith({ v: 2, roomId: "x" });
    a.onStatus!("SUBSCRIBED");
    a.onStatus!("TIMED_OUT");
    a.onStatus!("SUBSCRIBED");
    expect(resubscribed).not.toHaveBeenCalled();
    expect(onStatus.mock.calls.map((c) => c[0])).toEqual(["SUBSCRIBED", "TIMED_OUT", "SUBSCRIBED"]);
    cancelled = true;
    expect(a.isCancelled()).toBe(true);
    handle.stop();
    expect(stopped).toContain(a.name);
  });

  it("home-list: 감독 가입 · 재연결 R2 note 없음 · 해제 = stop · 해제 뒤 취소", async () => {
    const { subscribeHomeListRoomInsertBroadcast } = await import(
      "@/lib/community-messenger/realtime/home-list-room-insert-broadcast-client"
    );
    const off = subscribeHomeListRoomInsertBroadcast({ userId: "u-1", sb: fakeSb as never });
    await flush();
    const a = captured.at(-1)!;
    expect(a.scope).toBe("home_list_insert");
    const { ch, handlers } = fakeChannel();
    a.build(ch);
    expect(handlers.map((h) => h.type)).toEqual(["broadcast"]);
    a.onStatus?.("SUBSCRIBED");
    a.onStatus?.("SUBSCRIBED");
    expect(resubscribed).not.toHaveBeenCalled();
    off();
    expect(a.isCancelled()).toBe(true);
    expect(stopped).toContain(a.name);
  });

  it("typing: 감독 가입 · 해제(참조 0) 뒤 취소·stop · R2 note 없음", async () => {
    const { acquireMessengerTypingTopic } = await import(
      "@/lib/community-messenger/realtime/typing/messenger-typing-topic-registry"
    );
    const rel = acquireMessengerTypingTopic({ sb: fakeSb as never, roomId: "room-t", viewerUserId: "me" });
    await flush();
    const a = captured.at(-1)!;
    expect(a.name).toBe("community-messenger-typing:room-t");
    expect(a.scope).toBe("typing");
    const { ch, handlers } = fakeChannel();
    a.build(ch);
    expect(handlers).toHaveLength(2);
    a.onStatus?.("SUBSCRIBED");
    a.onStatus?.("SUBSCRIBED");
    expect(resubscribed).not.toHaveBeenCalled();
    expect(a.isCancelled()).toBe(false);
    rel();
    expect(a.isCancelled()).toBe(true);
    expect(stopped).toContain(a.name);
  });

  it("토픽 해제 기록: 감독 핸들 해제 직후 같은 토픽 whenMessengerTopicFree = true(빠른 재진입 공백 보상) · 기록은 곧 사라짐", async () => {
    const lease = await import("@/lib/community-messenger/realtime/messenger-channel-topic-lease");
    const stop = vi.fn();
    lease.releaseSupervisedMessengerChannel("community-messenger-room-bump:r-1", { stop });
    expect(stop).toHaveBeenCalledTimes(1);
    await expect(lease.whenMessengerTopicFree(fakeSb as never, "community-messenger-room-bump:r-1")).resolves.toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    await expect(lease.whenMessengerTopicFree(fakeSb as never, "community-messenger-room-bump:r-1")).resolves.toBe(false);
    lease.releaseSupervisedMessengerChannel("x", null);
  });
});
