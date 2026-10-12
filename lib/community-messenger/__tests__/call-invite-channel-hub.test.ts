import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/wait-for-realtime-auth", () => ({
  syncSupabaseRealtimeAuthFromSession: vi.fn(async () => undefined),
}));

import {
  CM_CALL_INVITE_BROADCAST_HANGUP,
  CM_CALL_INVITE_BROADCAST_RING,
  CM_CALL_INVITE_BROADCAST_TERMINAL,
  communityMessengerCallInviteListenerCount,
  resetCommunityMessengerCallInviteChannelHubsForTests,
  subscribeCommunityMessengerCallInviteBroadcast,
} from "@/lib/community-messenger/call-invite-realtime-broadcast";

type Handler = (msg: { event: string; payload: Record<string, unknown> }) => void;

/**
 * realtime-js 2.99.2 의미를 재현하는 가짜 클라이언트:
 * - `channel(topic)` 은 같은 토픽이면 기존 인스턴스를 반환 (RealtimeClient.channel)
 * - `removeChannel` 은 그 공유 인스턴스를 닫고 소켓 목록에서 제거 (RealtimeChannel.unsubscribe → _remove)
 */
function createFakeRealtimeClient() {
  const channels: Array<{
    topic: string;
    opts: unknown;
    handlers: Handler[];
    onCalls: number;
    subscribeCalls: number;
    closed: boolean;
    on: (type: string, filter: { event: string }, cb: Handler) => unknown;
    subscribe: () => unknown;
  }> = [];
  const removeChannel = vi.fn(async (ch: (typeof channels)[number]) => {
    ch.closed = true;
    const i = channels.indexOf(ch);
    if (i >= 0) channels.splice(i, 1);
    return "ok";
  });
  const sb = {
    realtime: { accessTokenValue: "user-jwt" },
    channel: vi.fn((topic: string, opts: unknown) => {
      const existing = channels.find((c) => c.topic === topic);
      if (existing) return existing;
      const ch = {
        topic,
        opts,
        handlers: [] as Handler[],
        onCalls: 0,
        subscribeCalls: 0,
        closed: false,
        on(_type: string, filter: { event: string }, cb: Handler) {
          this.onCalls += 1;
          expect(filter.event).toBe("*");
          this.handlers.push(cb);
          return this;
        },
        subscribe() {
          this.subscribeCalls += 1;
          return this;
        },
      };
      channels.push(ch);
      return ch;
    }),
    getChannels: () => channels,
    removeChannel,
  };
  const emit = (topic: string, event: string, payload: Record<string, unknown>) => {
    const ch = channels.find((c) => c.topic === topic && !c.closed);
    for (const h of ch?.handlers ?? []) h({ event, payload });
  };
  return { sb: sb as unknown as SupabaseClient, raw: sb, channels, removeChannel, emit };
}

const ME = "AAAAAAAA-1111-4111-8111-111111111111";
const TOPIC = `cm-call-invite:${ME.toLowerCase()}`;

describe("cm-call-invite shared channel hub (D-2)", () => {
  beforeEach(() => {
    resetCommunityMessengerCallInviteChannelHubsForTests();
  });

  it("closing a call screen consumer keeps the global incoming-call ring listener alive", () => {
    const rt = createFakeRealtimeClient();
    const globalRing = vi.fn();
    const releaseGlobal = subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, { onRing: globalRing });
    const releaseCallScreen = subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, { onHangup: vi.fn() });

    releaseCallScreen();
    expect(rt.removeChannel).not.toHaveBeenCalled();

    rt.emit(TOPIC, CM_CALL_INVITE_BROADCAST_RING, { sessionId: "s-2" });
    expect(globalRing).toHaveBeenCalledWith({ sessionId: "s-2" });

    releaseGlobal();
    expect(rt.removeChannel).toHaveBeenCalledTimes(1);
    expect(communityMessengerCallInviteListenerCount(ME)).toBe(0);
  });

  it("registers exactly one private binding per channel regardless of consumer count", () => {
    const rt = createFakeRealtimeClient();
    const releases = Array.from({ length: 5 }, () =>
      subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, { onHangup: vi.fn() })
    );
    expect(rt.channels).toHaveLength(1);
    expect(rt.channels[0].onCalls).toBe(1);
    expect(rt.channels[0].subscribeCalls).toBe(1);
    expect(rt.channels[0].opts).toEqual({ config: { private: true, broadcast: { ack: false, self: false } } });
    expect(communityMessengerCallInviteListenerCount(ME)).toBe(5);
    for (const r of releases) r();
    expect(communityMessengerCallInviteListenerCount(ME)).toBe(0);
    expect(rt.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("routes hangup + terminal to onHangup and other events (video upgrade) to onOtherEvent only", () => {
    const rt = createFakeRealtimeClient();
    const onRing = vi.fn();
    const onHangup = vi.fn();
    const onOtherEvent = vi.fn();
    subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, { onRing, onHangup, onOtherEvent });
    rt.emit(TOPIC, CM_CALL_INVITE_BROADCAST_HANGUP, { sessionId: "a" });
    rt.emit(TOPIC, CM_CALL_INVITE_BROADCAST_TERMINAL, { sessionId: "b", status: "cancelled" });
    rt.emit(TOPIC, "cm_video_upgrade_request", { sessionId: "c" });
    expect(onRing).not.toHaveBeenCalled();
    expect(onHangup).toHaveBeenNthCalledWith(1, { sessionId: "a" });
    expect(onHangup).toHaveBeenNthCalledWith(2, { sessionId: "b", status: "cancelled" });
    expect(onOtherEvent).toHaveBeenCalledWith("cm_video_upgrade_request", { sessionId: "c" });
  });

  it("delivers each event once per consumer (no duplicate dispatch)", () => {
    const rt = createFakeRealtimeClient();
    const a = vi.fn();
    const b = vi.fn();
    subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, { onHangup: a });
    subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, { onHangup: b });
    rt.emit(TOPIC, CM_CALL_INVITE_BROADCAST_TERMINAL, { sessionId: "x" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("isolates a throwing consumer from the global ring listener", () => {
    const rt = createFakeRealtimeClient();
    const globalRing = vi.fn();
    subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, {
      onRing: () => {
        throw new Error("consumer bug");
      },
    });
    subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, { onRing: globalRing });
    rt.emit(TOPIC, CM_CALL_INVITE_BROADCAST_RING, { sessionId: "s" });
    expect(globalRing).toHaveBeenCalledTimes(1);
  });

  it("release is idempotent and only removes its own consumer", () => {
    const rt = createFakeRealtimeClient();
    const keep = vi.fn();
    const release = subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, { onHangup: vi.fn() });
    subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, { onHangup: keep });
    release();
    release();
    expect(communityMessengerCallInviteListenerCount(ME)).toBe(1);
    expect(rt.removeChannel).not.toHaveBeenCalled();
    rt.emit(TOPIC, CM_CALL_INVITE_BROADCAST_HANGUP, { sessionId: "z" });
    expect(keep).toHaveBeenCalledTimes(1);
  });

  it("reopens the channel with existing consumers when it was removed from the socket externally", () => {
    const rt = createFakeRealtimeClient();
    const globalRing = vi.fn();
    subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, { onRing: globalRing });
    // e.g. sb.removeAllChannels() during logout teardown
    void rt.raw.removeChannel(rt.channels[0]);
    expect(rt.channels).toHaveLength(0);

    subscribeCommunityMessengerCallInviteBroadcast(rt.sb, ME, { onHangup: vi.fn() });
    expect(rt.channels).toHaveLength(1);
    rt.emit(TOPIC, CM_CALL_INVITE_BROADCAST_RING, { sessionId: "after-reopen" });
    expect(globalRing).toHaveBeenCalledWith({ sessionId: "after-reopen" });
    expect(communityMessengerCallInviteListenerCount(ME)).toBe(2);
  });
});
