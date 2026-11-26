// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Boot/IO Authority contract ③: the FIRST SUBSCRIBED of each home channel is a cold bind and
 * must NOT trigger a full home sync (bootstrap owns cold data). Only a RESUBSCRIBE (reconnect)
 * schedules a catch-up refresh.
 */

type OnStatus = (status: string) => void;
const capturedOnStatus: OnStatus[] = [];
const scheduleSpy = vi.fn();

vi.mock("@/lib/community-messenger/realtime/subscribe-with-retry", () => ({
  subscribeWithRetry: (args: { onStatus?: OnStatus }) => {
    if (args.onStatus) capturedOnStatus.push(args.onStatus);
    return { channel: {}, stop: () => {}, markSignal: () => {} };
  },
}));

vi.mock("@/lib/community-messenger/realtime/community-messenger-realtime-schedulers", () => ({
  createRefreshScheduler: () => ({ schedule: scheduleSpy, cancel: () => {} }),
}));

import { bindCommunityMessengerHomeRealtimeChannels } from "@/lib/community-messenger/realtime/community-messenger-home-realtime-channels";

const bound: Array<{ cancelSchedulers: () => void }> = [];

function bind() {
  const onRefreshRef = { current: () => {} };
  const messageInsertHintRef = { current: undefined };
  const messageUpdateHintRef = { current: undefined };
  const roomTipUpdateHintRef = { current: undefined };
  const participantUnreadDeltaRef = { current: undefined };
  const r = bindCommunityMessengerHomeRealtimeChannels({
    sb: { channel: () => ({}), removeChannel: () => {} } as never,
    userId: "user-1",
    isCancelled: () => false,
    roomIdsFingerprint: "room-a\0room-b",
    channelBindRole: "home_rooms_in",
    includeMeta: true,
    messageInsertHintRef: messageInsertHintRef as never,
    messageUpdateHintRef: messageUpdateHintRef as never,
    roomTipUpdateHintRef: roomTipUpdateHintRef as never,
    participantUnreadDeltaRef: participantUnreadDeltaRef as never,
    onRefreshRef: onRefreshRef as never,
  });
  bound.push(r);
  return r;
}

describe("home realtime first SUBSCRIBED skip (contract ③)", () => {
  beforeEach(() => {
    capturedOnStatus.length = 0;
    scheduleSpy.mockClear();
  });
  afterEach(() => {
    for (const b of bound.splice(0)) b.cancelSchedulers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not schedule a full sync on the first SUBSCRIBED of any channel", () => {
    bind();
    expect(capturedOnStatus.length).toBeGreaterThan(0);
    for (const onStatus of capturedOnStatus) onStatus("SUBSCRIBED");
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it("schedules a catch-up on a resubscribe (second SUBSCRIBED) — D2 R2: 재동기화 묶음(1초 조용) 뒤 1번", () => {
    vi.useFakeTimers();
    bind();
    const [firstChannel, secondChannel] = capturedOnStatus;
    firstChannel("SUBSCRIBED"); // cold → skip
    secondChannel?.("SUBSCRIBED");
    expect(scheduleSpy).not.toHaveBeenCalled();
    firstChannel("SUBSCRIBED"); // reconnect
    secondChannel?.("SUBSCRIBED"); // reconnect (같은 묶음)
    expect(scheduleSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_100);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores non-SUBSCRIBED statuses", () => {
    bind();
    const [firstChannel] = capturedOnStatus;
    firstChannel("CLOSED");
    firstChannel("TIMED_OUT");
    expect(scheduleSpy).not.toHaveBeenCalled();
    firstChannel("SUBSCRIBED"); // still the cold bind
    expect(scheduleSpy).not.toHaveBeenCalled();
  });
});
