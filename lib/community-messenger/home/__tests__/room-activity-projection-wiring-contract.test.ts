/**
 * Contract: tip writes converge on projectRoomActivityToHomeList.
 * Dual tip authority (ACK + Host + Home each calling applyHomeListPatch for tips) is forbidden.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("room activity projection wiring contract", () => {
  it("outbound ACK routes through projectRoomActivityToHomeList", () => {
    const src = read("lib/community-messenger/multi-tab-bus.ts");
    expect(src).toContain("projectRoomActivityToHomeList");
    expect(src).toContain("roomActivityFromMessengerMessage");
    expect(src).toContain("syncMessengerHomeAfterOutboundSend");
  });

  it("room ingest defers tip projection to applyIncomingMessageEvent SSOT", () => {
    const src = read("lib/community-messenger/room/use-messenger-room-realtime-message-ingest.ts");
    expect(src).toContain("applyIncomingMessageEvent");
    expect(src).toContain("cm.room.incoming_message");
  });

  it("applyIncomingMessageEvent projects hub tip after timeline commit", () => {
    const src = read("lib/community-messenger/stores/messenger-realtime-store.ts");
    expect(src).toContain("projectRoomActivityToHomeList");
    expect(src).toContain("roomActivityFromMessengerMessage");
    expect(src).toContain("Tip candidate is captured even on timeline duplicate");
  });

  it("bump snapshot merge projects hub tip via applyIncomingMessageEvent SSOT", () => {
    const src = read("lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts");
    expect(src).toContain("applyIncomingMessageEvent");
    expect(src).toContain("mergeRoomMessages");
    expect(src).toMatch(/setRoomMessages[\s\S]*applyIncomingMessageEvent/);
  });

  it("remote catch-up merge projects hub tip via applyIncomingMessageEvent SSOT", () => {
    const src = read("lib/community-messenger/room/use-messenger-room-remote-catchup.ts");
    expect(src).toContain("applyIncomingMessageEvent");
    expect(src).toContain("projectHubTipAfterCatchUpMerge");
    expect(src).not.toMatch(/applyHomeListPatch\s*\(/);
  });

  it("call stub posts projection before bus", () => {
    const src = read("lib/community-messenger/multi-tab-bus.ts");
    expect(src).toContain('source: "call_event"');
    expect(src).toContain("postCommunityMessengerCallStubPreviewBusEvent");
  });

  it("DomainHost does not early-return solely on missing bus identity for tip", () => {
    const src = read("components/messenger/DomainRoomStateRealtimeHost.tsx");
    expect(src).toContain("findHomeListRoomRow");
    expect(src).toContain("roomActivityFromMessageRow");
    expect(src).not.toMatch(/if\s*\(\s*!ev\.chatDomain\s*\|\|\s*!ev\.domainIdentityKey\s*\)\s*return/);
  });

  it("exit reconcile is wired from markCommunityMessengerHomeReturn", () => {
    const src = read("lib/community-messenger/home-return-timing.ts");
    expect(src).toContain("reconcileExitedRoomSummary");
    expect(src).toContain("roomId");
  });

  it("Home UPDATE/TIP batches route tip through projectRoomActivityToHomeList", () => {
    const src = read("lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts");
    expect(src).toContain("projectRoomActivityToHomeList");
    expect(src).not.toMatch(/kind:\s*"realtime_message_update"/);
    expect(src).not.toMatch(/kind:\s*"room_tip_update"/);
  });

  it("Domain message tip mirror uses projection; soft bump does not mirror tip", () => {
    const src = read("lib/community-messenger/realtime/domain-room-state-store.ts");
    expect(src).toContain("projectRoomActivityToHomeList");
    expect(src).toMatch(/dispatchDomainRoomBump[\s\S]*mirrorListCache:\s*false/);
  });

  it("dial seed does not publish mid-call stub tip (Native ringing authority)", () => {
    const src = read("lib/community-messenger/call-session-navigation-seed.ts");
    // CONTRACT: terminal-only messenger history — no outgoing_started / dialing tip on start.
    expect(src).not.toContain("postCommunityMessengerCallStubPreviewBusEvent");
    expect(src).not.toContain("outgoing_started");
    expect(src).not.toMatch(/type:\s*"cm\.room\.message_sent"[\s\S]{0,200}?lastMessageType:\s*"call_stub"/);
    expect(src).toContain("ringing mid-call tip/stub is Native UI only");
  });

  it("bootstrap cache tip bus kinds route through projection", () => {
    const src = read("lib/community-messenger/home/bootstrap-cache-bus-writer.ts");
    expect(src).toContain("projectRoomActivityToHomeList");
    expect(src).toContain("projection_already_applied");
  });
});
