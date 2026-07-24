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

function bind() {
  const onRefreshRef = { current: () => {} };
  const messageInsertHintRef = { current: undefined };
  const participantUnreadDeltaRef = { current: undefined };
  return bindCommunityMessengerHomeRealtimeChannels({
    sb: { channel: () => ({}), removeChannel: () => {} } as never,
    userId: "user-1",
    isCancelled: () => false,
    roomIdsFingerprint: "room-a\0room-b",
    channelBindRole: "home_rooms_in",
    includeMeta: true,
    messageInsertHintRef: messageInsertHintRef as never,
    participantUnreadDeltaRef: participantUnreadDeltaRef as never,
    onRefreshRef: onRefreshRef as never,
  });
}

describe("home realtime first SUBSCRIBED skip (contract ③)", () => {
  beforeEach(() => {
    capturedOnStatus.length = 0;
    scheduleSpy.mockClear();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not schedule a full sync on the first SUBSCRIBED of any channel", () => {
    bind();
    expect(capturedOnStatus.length).toBeGreaterThan(0);
    for (const onStatus of capturedOnStatus) onStatus("SUBSCRIBED");
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it("schedules a catch-up on a resubscribe (second SUBSCRIBED)", () => {
    bind();
    const [firstChannel] = capturedOnStatus;
    firstChannel("SUBSCRIBED"); // cold → skip
    expect(scheduleSpy).not.toHaveBeenCalled();
    firstChannel("SUBSCRIBED"); // reconnect → schedule
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
