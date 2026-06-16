import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("incoming-call SSOT contract", () => {
  it("SSOT document exists with 3-layer ownership and A–G QA matrix", () => {
    const doc = read("docs/community-messenger/incoming-call-ssot.md");
    expect(doc).toContain("Ownership model (3 layers)");
    expect(doc).toContain("FCM is a signal, not state");
    expect(doc).toContain("terminal latch");
    expect(doc).toContain("| **A** |");
    expect(doc).toContain("| **G** |");
    expect(doc).toContain("Android APK (Capacitor)");
    expect(doc).toContain("new callId");
  });

  it("normalizer modules exist and are referenced in SSOT", () => {
    const doc = read("docs/community-messenger/incoming-call-ssot.md");
    expect(doc).toContain("fcm-call-event-normalizer.ts");
    expect(doc).toContain("session-merge-guard.ts");
    expect(doc).toContain("call-terminal-tombstone.ts");
    expect(read("lib/community-messenger/call-events/fcm-call-event-normalizer.ts")).toContain(
      "normalizeFcmCallEvent"
    );
    expect(read("lib/community-messenger/call-events/session-merge-guard.ts")).toContain(
      "shouldBlockRingingSessionMerge"
    );
    expect(read("lib/community-messenger/call-state/call-terminal-tombstone.ts")).toContain(
      "canShowIncoming"
    );
  });

  it("Global Phase2 wires SSOT normalizers for wake/merge/terminal", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("resolveIncomingCallWake");
    expect(global).toContain("buildCallTombstoneContext");
    expect(global).toContain("filterSessionsRespectingTerminalLatch");
    expect(global).toContain("canShowIncoming");
    expect(global).not.toContain("isIncomingCallTerminal");
  });

  it("Global Phase3 routes realtime/missed terminal through sealIncomingCallTerminal", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain('sealIncomingCallTerminal(sid, "accepted", hard, "realtime_update_active")');
    expect(global).toContain('"realtime_update_terminal"');
    expect(global).toContain('"missed_timeout"');
    expect(global).not.toMatch(
      /nextStatus === "active"[\s\S]{0,120}markCallConsumed\(sid, "accepted"\)/
    );
  });

  it("public/sw.js chat notification wake/click paths unchanged", () => {
    const sw = read("public/sw.js");
    expect(sw).toContain('payload.notification_type === "community_messenger_message"');
    expect(sw).toContain('type: "samarket_messenger_message_wake"');
    expect(sw).toContain("roomId: roomId");
    expect(sw).toContain("samarket_messenger_incoming_call_wake");
    expect(sw).toContain("call_canceled");
  });
});
