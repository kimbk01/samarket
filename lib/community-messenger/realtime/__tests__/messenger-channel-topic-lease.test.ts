import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetMessengerChannelTopicLeaseForTests,
  releaseMessengerChannel,
  whenMessengerTopicFree,
} from "@/lib/community-messenger/realtime/messenger-channel-topic-lease";

/**
 * 가짜 RealtimeClient — realtime-js 2.99 `channel(topic)` 의 「상태 무시 같은 객체 반환」과
 * `removeChannel` 의 leaving → (leave 응답 뒤) 목록 제거를 재현한다.
 */
type FakeChannel = { topic: string; state: string; id: number };

function createFakeClient() {
  let seq = 0;
  let channels: FakeChannel[] = [];
  const leaveResolvers: Array<() => void> = [];
  return {
    channel(name: string): FakeChannel {
      const topic = `realtime:${name}`;
      const exists = channels.find((c) => c.topic === topic);
      if (exists) return exists;
      const ch = { topic, state: "closed", id: ++seq };
      channels.push(ch);
      return ch;
    },
    join(ch: FakeChannel) {
      if (ch.state === "closed") ch.state = "joined";
    },
    removeChannel(ch: FakeChannel): Promise<string> {
      ch.state = "leaving";
      return new Promise((resolve) => {
        leaveResolvers.push(() => {
          ch.state = "closed";
          channels = channels.filter((c) => c.topic !== ch.topic);
          resolve("ok");
        });
      });
    },
    getChannels: () => channels,
    flushLeaves() {
      while (leaveResolvers.length) leaveResolvers.shift()!();
    },
  };
}

describe("messenger-channel-topic-lease (X4)", () => {
  beforeEach(() => __resetMessengerChannelTopicLeaseForTests());

  it("without the lease, re-creating the same topic right after release returns the leaving object (the bug)", () => {
    const sb = createFakeClient();
    const a = sb.channel("cm-read-ack:r1");
    sb.join(a);
    void sb.removeChannel(a);
    const b = sb.channel("cm-read-ack:r1");
    expect(b).toBe(a);
    expect(b.state).toBe("leaving");
  });

  it("release → whenTopicFree → new channel object (joinable)", async () => {
    const sb = createFakeClient();
    const a = sb.channel("cm-read-ack:r1");
    sb.join(a);
    releaseMessengerChannel(sb as never, a as never);
    const free = whenMessengerTopicFree(sb as never, "cm-read-ack:r1");
    sb.flushLeaves();
    await expect(free).resolves.toBe(true);
    const b = sb.channel("cm-read-ack:r1");
    expect(b).not.toBe(a);
    sb.join(b);
    expect(b.state).toBe("joined");
  });

  it("removes an untracked leaving channel of the same topic before returning", async () => {
    const sb = createFakeClient();
    const a = sb.channel("community-messenger-typing:r1");
    sb.join(a);
    void sb.removeChannel(a);
    const free = whenMessengerTopicFree(sb as never, "community-messenger-typing:r1");
    await Promise.resolve();
    sb.flushLeaves();
    await expect(free).resolves.toBe(true);
    expect(sb.channel("community-messenger-typing:r1")).not.toBe(a);
  });

  it("returns false (no wait) when nothing is pending and does not touch a live joined channel", async () => {
    const sb = createFakeClient();
    const live = sb.channel("cm-home-list:u1");
    sb.join(live);
    await expect(whenMessengerTopicFree(sb as never, "cm-home-list:u1")).resolves.toBe(false);
    expect(live.state).toBe("joined");
  });
});
