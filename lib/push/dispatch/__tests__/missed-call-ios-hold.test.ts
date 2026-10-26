import { describe, expect, it } from "vitest";
import {
  mapVoipSentToInstallDevice,
  missedCallIosHoldWaitMs,
  MISSED_CALL_IOS_HOLD_MAX_WAIT_MS,
  orderTargetsForMissedCallIosHold,
} from "@/lib/push/dispatch/missed-call-ios-hold";

describe("D-2 부재중 iOS 일반 알림 보류", () => {
  it("VoIP 발송 + 30초 + 5초까지 기다림 — 운영 실측(VoIP→부재중 31.6~32.5초)이면 약 2.5~3.4초", () => {
    const voip = 1_000_000;
    expect(missedCallIosHoldWaitMs(voip, voip + 31_600)).toBe(3_400);
    expect(missedCallIosHoldWaitMs(voip, voip + 32_500)).toBe(2_500);
  });

  it("이미 지났으면 0, 최대 10초", () => {
    expect(missedCallIosHoldWaitMs(1_000, 1_000 + 40_000)).toBe(0);
    expect(missedCallIosHoldWaitMs(1_000, 1_000)).toBe(MISSED_CALL_IOS_HOLD_MAX_WAIT_MS);
    expect(missedCallIosHoldWaitMs(Number.NaN, 0)).toBe(0);
  });

  it("발송 기록의 VoIP 행 id → 같은 iPhone 설치 id", () => {
    const targets = [
      { id: "row-voip", push_provider: "voip_apns", device_id: "install-1" },
      { id: "row-apns", push_provider: "apns", device_id: "install-1" },
      { id: "row-fcm", push_provider: "fcm", device_id: "android-1" },
    ];
    const map = mapVoipSentToInstallDevice(new Map([["row-voip", 5]]), targets);
    expect([...map.entries()]).toEqual([["install-1", 5]]);
  });

  it("보류 대상(그 설치의 일반 APNs)만 맨 뒤 — Android·VoIP 없던 iOS 는 먼저", () => {
    const targets = [
      { id: "a", push_provider: "apns", device_id: "install-1" },
      { id: "b", push_provider: "fcm", device_id: "android-1" },
      { id: "c", push_provider: "apns", device_id: "install-2" },
    ];
    const ordered = orderTargetsForMissedCallIosHold(targets, new Map([["install-1", 1]]));
    expect(ordered.map((t) => t.id)).toEqual(["b", "c", "a"]);
    expect(orderTargetsForMissedCallIosHold(targets, new Map())).toBe(targets);
  });
});
