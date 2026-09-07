import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const fcm = () => read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
const probe = () =>
  read("android/app/src/main/java/com/dibay/app/IncomingCallSessionStatusProbe.java");
const delivery = () => read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
const voiceRuntime = () =>
  read("android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java");
const videoRuntime = () =>
  read("android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java");
const pushLog = () => read("android/app/src/main/java/com/dibay/app/DibayCallPushLog.java");
const voip = () => read("ios/App/App/Push/VoIPPushRegistry.swift");

describe("CUT7 #6 Android late incoming push resurrection (LP1–LP13 source)", () => {
  it("LP1: ringing allow path still reaches delivery after gate", () => {
    const src = fcm();
    expect(src).toContain("shouldAllowIncomingPresentation");
    expect(src).toContain("IncomingCallPushDelivery.deliver");
    const gateIdx = src.indexOf("shouldAllowIncomingPresentation");
    const deliverIdx = src.indexOf("IncomingCallPushDelivery.deliver");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(deliverIdx).toBeGreaterThan(gateIdx);
  });

  it("LP2–LP5: terminal statuses blocked before delivery", () => {
    expect(probe()).toContain('case "ended":');
    expect(probe()).toContain('case "missed":');
    expect(probe()).toContain('case "cancelled":');
    expect(probe()).toContain('case "rejected":');
    expect(fcm()).toContain("incoming_late_terminal_blocked");
    expect(fcm()).toContain("IncomingCallTerminalHandler.handle");
    const block = fcm().slice(
      fcm().indexOf("isTerminalStatus(serverStatus)"),
      fcm().indexOf("IncomingCallPushDelivery.deliver"),
    );
    expect(block).toContain("return;");
  });

  it("LP6: active session treated as non-presentable terminal", () => {
    expect(probe()).toContain('case "active":');
    expect(fcm()).toContain('call_answered_elsewhere"');
  });

  it("LP7: grace cannot resurrect after serverExpiresAt without ringing", () => {
    expect(probe()).toContain("shouldAllowIncomingPresentation");
    expect(probe()).toContain("serverRingWindowExpired");
    expect(fcm()).toContain("serverRingWindowExpired");
    expect(fcm()).toContain("incoming_stale_presentation_blocked");
    // Grace still exists for transport — not deleted.
    expect(pushLog()).toContain("INCOMING_GRACE_MS");
    expect(pushLog()).toContain("Math.max(serverExpiresAt, graceExpiresAt)");
  });

  it("LP8: fresh ringing / fail-open while window open preserved", () => {
    expect(probe()).toContain("return !serverRingWindowExpired");
    expect(probe()).toContain("isRingingStatus");
  });

  it("LP9: consumed dedupe preserved before expiry/probe", () => {
    const src = fcm();
    const consumedIdx = src.indexOf("DibayCallConsumedStore.isConsumed");
    const probeIdx = src.indexOf("IncomingCallSessionStatusProbe.fetchStatus");
    expect(consumedIdx).toBeGreaterThan(-1);
    expect(probeIdx).toBeGreaterThan(consumedIdx);
  });

  it("LP10/LP11: Voice + Video share same FCM gate before delivery", () => {
    const src = fcm();
    expect(src).toContain("NativeVoiceCallLane.shouldHandleIncoming");
    expect(src).toContain("NativeVideoCallLane.shouldHandleIncoming");
    const gateIdx = src.indexOf("shouldAllowIncomingPresentation");
    expect(src.indexOf("NativeVoiceCallLane.shouldHandleIncoming")).toBeGreaterThan(gateIdx);
    expect(src.indexOf("NativeVideoCallLane.shouldHandleIncoming")).toBeGreaterThan(gateIdx);
  });

  it("LP12: suppress path never reaches RingOwner / Runtime handleIncoming", () => {
    const src = fcm();
    const stale = src.slice(
      src.indexOf("incoming_stale_presentation_blocked"),
      src.indexOf("IncomingCallRingtoneSsotCache.putFromPayload"),
    );
    expect(stale).toContain("DibayCallConsumedStore.mark");
    expect(stale).toContain("return;");
    expect(stale).not.toContain("IncomingCallPushDelivery.deliver");
    expect(delivery()).toContain("NativeVoiceCallRuntime.handleIncoming");
    expect(delivery()).toContain("NativeVideoCallRuntime.handleIncoming");
    expect(delivery()).not.toContain("IncomingCallRingOwner.start");
    // RingOwner only after Runtime handleIncoming (post-delivery).
    expect(voiceRuntime()).toContain("IncomingCallRingOwner.start");
    expect(videoRuntime()).toContain("IncomingCallRingOwner.start");
  });

  it("LP13: delay blind zone removed; iOS #5 preserved", () => {
    expect(probe()).toContain("shouldProbe");
    expect(probe()).toMatch(/public static boolean shouldProbe[\s\S]*return true/);
    expect(fcm()).not.toContain("shouldProbe(expiry)");
    expect(fcm()).toContain("fetchStatus(this, callId)");
    // iOS #5 lock untouched
    expect(voip()).toContain("shouldApplyVoipTerminal");
    expect(voip()).toContain("ios_voip_terminal_stale_suppressed");
  });

  it("boundary: presentation gate independent of 10s threshold", () => {
    expect(probe()).not.toContain("deliveryDelayMs >= 10_000");
    expect(fcm()).not.toContain("deliveryDelayMs >= 10_000");
  });
});
