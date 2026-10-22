import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isStaleRealtimeBindGeneration } from "@/lib/community-messenger/realtime/realtime-bind-generation";
import { runMessengerRoomCatchUpSingleFlight } from "@/lib/community-messenger/room/messenger-room-catchup-anchor";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("T8 TOKEN refresh old generation cleanup", () => {
  it("stale generation callbacks are dropped", () => {
    expect(
      isStaleRealtimeBindGeneration({ cancelled: false, liveGeneration: 2, callbackGeneration: 1 })
    ).toBe(true);
    expect(
      isStaleRealtimeBindGeneration({ cancelled: false, liveGeneration: 2, callbackGeneration: 2 })
    ).toBe(false);
    expect(
      isStaleRealtimeBindGeneration({ cancelled: true, liveGeneration: 2, callbackGeneration: 2 })
    ).toBe(true);
  });

  it("room bundle and home stop previous channels before subscribe and gate callbacks by generation", () => {
    const bundle = read("lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts");
    expect(bundle).toContain("isStaleRealtimeBindGeneration");
    expect(bundle).toContain("staleBind()");
    expect(bundle).toMatch(/for \(const ch of channels\) ch\.stop\(\)/);
    const home = read("lib/community-messenger/use-community-messenger-realtime.ts");
    expect(home).toContain("homeBindGeneration");
    expect(home).toMatch(/for \(const item of channels\) item\.stop\(\)[\s\S]*bindCommunityMessengerHomeRealtimeChannels/);
    expect(home).toContain("bindGen !== homeBindGeneration");
  });
});

describe("T9 one server message one visible row", () => {
  it("realtime echo and catch-up share mergeRoomMessages identity", () => {
    const ingest = read("lib/community-messenger/room/use-messenger-room-remote-catchup.ts");
    expect(ingest).toContain("mergeRoomMessages(prev, incoming)");
    expect(ingest).toContain("runMessengerRoomCatchUpSingleFlight");
  });
});

describe("T13 logout/account switch channel isolation", () => {
  it("logout wipes messenger store and snapshot; SIGNED_OUT clears realtime auth", () => {
    const wipe = read("lib/auth/client-session-wipe.ts");
    expect(wipe).toContain("resetMessengerRealtimeStore");
    expect(wipe).toContain("clearAllRoomSnapshotCaches");
    const client = read("lib/supabase/client.ts");
    expect(client).toMatch(/SIGNED_OUT[\s\S]*realtime\.setAuth\(\)/);
    const bundle = read("lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts");
    expect(bundle).toMatch(/entry\.stop = \(\) => \{[\s\S]*unsubscribeTokenRefresh\(\)/);
  });
});

describe("T14 read-ack after token refresh", () => {
  it("read-ack resubscribe bumps generation and ignores old callbacks", () => {
    const src = read("lib/community-messenger/realtime/cm-read-ack-broadcast-client.ts");
    expect(src).toContain("readAckGeneration");
    expect(src).toContain("callbackGeneration !== readAckGeneration");
    expect(src).toContain("subscribeSamarketRealtimeTokenRefreshed");
  });
});

describe("T15 room list latest message coherence", () => {
  it("outbound confirm writes store/snapshot then home tip with the same message id", () => {
    const phase2 = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    expect(phase2).toMatch(
      /applyIncomingMessageEvent[\s\S]*syncMessengerHomeAfterOutboundSend/
    );
    const bus = read("lib/community-messenger/multi-tab-bus.ts");
    expect(bus).toContain('source: "local_send_ack"');
    expect(bus).toContain("projectRoomActivityToHomeList");
  });
});

describe("catch-up single flight", () => {
  it("concurrent same cursor shares one run", async () => {
    let runs = 0;
    const a = runMessengerRoomCatchUpSingleFlight("room-a", "msg-1", async () => {
      runs += 1;
      await Promise.resolve();
      return true;
    });
    const b = runMessengerRoomCatchUpSingleFlight("room-a", "msg-1", async () => {
      runs += 1;
      return true;
    });
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(runs).toBe(1);
  });
});
