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

  it("Global Phase4 routes FCM terminal through sealFcmTerminalEvent", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("onFcmTerminal:");
    expect(global).toContain("sealFcmTerminalEvent");
    expect(global).toContain("skipSeal: true");
    expect(global).not.toContain("onCanceled:");
    expect(global).not.toContain("onTerminal:");
  });

  it("Global Phase5 routes realtime terminal and SW cancel through seal", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain('sealIncomingCallTerminal(sid, "cancelled", hard, "realtime_terminal")');
    expect(global).toContain("samarket_messenger_call_canceled_wake");
    expect(global).toContain('"sw_cancel_wake"');
    expect(global).not.toMatch(
      /if \(terminal\)[\s\S]{0,400}dibayIncomingLaneStopRing\("realtime_terminal"/
    );
  });

  it("Global Phase6 separates incoming_consumed bus seal vs dismiss-only", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("resolveIncomingConsumedBusSealReason");
    expect(global).toContain('sealIncomingCallTerminal(sid, sealReason, hard, "incoming_consumed_bus")');
    expect(global).toContain("incoming_consumed_bus_dismiss");
    const branches = global.match(/if \(sealReason\) \{([\s\S]*?)\} else \{([\s\S]*?)\}/);
    expect(branches).toBeTruthy();
    expect(branches![1]).toContain("sealIncomingCallTerminal");
    expect(branches![1]).not.toContain("dismissedIncomingSessionsAtRef");
    expect(branches![2]).toContain("dismissedIncomingSessionsAtRef");
  });

  it("Global Phase7 routes rejectCall through declined terminal seal not dismiss", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    const rejectBlock = global.match(/const rejectCall = useCallback\(async \(sessionId: string\) => \{([\s\S]*?)\n  \}, \[busyId, refresh, sessions\]\);/);
    expect(rejectBlock).toBeTruthy();
    const body = rejectBlock![1];
    expect(body).toContain('sealIncomingCallTerminal(sessionId, "declined", hard, "reject_pressed")');
    expect(body).not.toContain("markCallConsumed(");
    expect(body).not.toContain("dismissedIncomingSessionsAtRef");
    expect(body).toContain("runIncomingCallReject");
  });

  it("Global Phase8 routes busy auto-reject through declined terminal seal", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain('sealIncomingCallTerminal(sid, "declined", hard, "busy_auto_reject")');
    expect(global).toContain("canShowIncoming(sid, tombstone)");
    expect(global).not.toMatch(
      /autoRejectIds[\s\S]{0,600}dismissedIncomingSessionsAtRef/
    );
  });

  it("Global Phase10 uses dismissIncomingPresenterAfterAccept without terminal seal on accept", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("dismissIncomingPresenterAfterAccept");
    expect(global).toContain('ringStopSource: "group_accept"');
    const acceptIdx = global.indexOf("const acceptCall = useCallback");
    expect(acceptIdx).toBeGreaterThan(-1);
    const acceptSlice = global.slice(acceptIdx, acceptIdx + 3500);
    expect(acceptSlice).not.toContain("sealIncomingCallTerminal");
    expect(acceptSlice).not.toContain("markCallConsumed(");
    const helper = read("lib/community-messenger/incoming-call/accept-presenter-dismiss.ts");
    expect(helper).not.toContain("sealIncomingCallTerminal");
    expect(helper).not.toContain("markCallConsumed");
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
