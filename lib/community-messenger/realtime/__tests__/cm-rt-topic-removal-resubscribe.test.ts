import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  cmRtTopicRemovalPending,
  removeCmRtChannelTracked,
  runAfterCmRtTopicRemoval,
} from "@/lib/community-messenger/realtime/cm-rt-channel-registry";

function deferred() {
  let resolve!: (v: "ok") => void;
  const promise = new Promise<"ok">((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("M-5 same-topic resubscribe waits for removeChannel completion", () => {
  it("start runs synchronously when no removal is pending", () => {
    let started = false;
    runAfterCmRtTopicRemoval("topic-free", () => {
      started = true;
    });
    expect(started).toBe(true);
  });

  it("start is deferred until the pending removal resolves", async () => {
    const d = deferred();
    const sb = { removeChannel: () => d.promise };
    const removal = removeCmRtChannelTracked(sb as never, {} as RealtimeChannel, "community-messenger-room-bump:r1");
    expect(cmRtTopicRemovalPending("realtime:community-messenger-room-bump:r1")).toBe(true);
    let started = false;
    runAfterCmRtTopicRemoval("community-messenger-room-bump:r1", () => {
      started = true;
    });
    await Promise.resolve();
    expect(started).toBe(false);
    d.resolve("ok");
    await removal;
    await Promise.resolve();
    expect(started).toBe(true);
    expect(cmRtTopicRemovalPending("community-messenger-room-bump:r1")).toBe(false);
  });

  it("removeChannel throwing/rejecting still releases the topic", async () => {
    const sb = {
      removeChannel: () => {
        throw new Error("boom");
      },
    };
    await removeCmRtChannelTracked(sb as never, {} as RealtimeChannel, "t-throw");
    expect(cmRtTopicRemovalPending("t-throw")).toBe(false);
    const sb2 = { removeChannel: () => Promise.reject(new Error("x")) };
    await removeCmRtChannelTracked(sb2 as never, {} as RealtimeChannel, "t-reject");
    await Promise.resolve();
    expect(cmRtTopicRemovalPending("t-reject")).toBe(false);
  });

  it("read-ack client binds once (no token-refresh resubscribe) and waits on topic removal", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/realtime/cm-read-ack-broadcast-client.ts"), "utf8");
    expect(src).not.toContain("subscribeSamarketRealtimeTokenRefreshed");
    expect(src).toContain("if (cancelled || ch) return;");
    expect(src).toContain("runAfterCmRtTopicRemoval(channelName");
    expect(src).toContain("removeCmRtChannelTracked(sb, ch, channelName)");
  });

  it("room bump channels are per-room refcounted with deferred release + removal wait", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts"),
      "utf8"
    );
    expect(src).toContain("runAfterCmRtTopicRemoval(channelName");
    expect(src).toContain("removeCmRtChannelTracked(sb, channel, channelName)");
    expect(src).toContain('notifyMessengerRoomRealtimeResumed(rid, "resubscribed")');
    expect(src).toContain("entry.releaseTimer = setTimeout(");
  });
});
