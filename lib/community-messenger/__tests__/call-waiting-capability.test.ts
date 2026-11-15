import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALL_WAITING_MIN_BUILD,
  decideCallWaitingSupport,
  parseAppBuildNumber,
  pickCallWaitingLiveRow,
} from "@/lib/community-messenger/call-waiting-capability";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

/** 대기 통화 서버 단계 — docs/audit/call-waiting-stage2-design-2026-11-15.md WS1·WS2·WS3·WS5 (Owner 「서버 단계 진행」 2026-11-15). */

const android = (build: number, deviceId = "d1") => ({
  device_id: deviceId,
  platform: "android",
  push_provider: "fcm",
  app_version: `1.2.7 (${build})`,
});
const ios = (build: number, provider: string, deviceId = "i1") => ({
  device_id: deviceId,
  platform: "ios",
  push_provider: provider,
  app_version: `1.2.2 (${build})`,
});

describe("대기 통화 기기 조건 (WS2)", () => {
  it("빌드 번호 읽기", () => {
    expect(parseAppBuildNumber("1.2.7 (54)")).toBe(54);
    expect(parseAppBuildNumber("1.2")).toBeNull();
    expect(parseAppBuildNumber(null)).toBeNull();
  });

  it("Android 1대 + 최소 빌드 이상 → 허용, 미만 → 1단계", () => {
    const min = CALL_WAITING_MIN_BUILD.android;
    expect(decideCallWaitingSupport({ devices: [android(min)], answeredDeviceIdIfRecipient: null })).toMatchObject({
      ok: true,
      platform: "android",
    });
    expect(decideCallWaitingSupport({ devices: [android(min - 1)], answeredDeviceIdIfRecipient: null })).toMatchObject({
      ok: false,
      reason: "build_too_old",
    });
  });

  it("iOS 는 VoIP 등록 필요 (맥은 VoIP 없음)", () => {
    const min = CALL_WAITING_MIN_BUILD.ios;
    expect(
      decideCallWaitingSupport({ devices: [ios(min, "apns"), ios(min, "voip_apns")], answeredDeviceIdIfRecipient: null }),
    ).toMatchObject({ ok: true, platform: "ios" });
    expect(decideCallWaitingSupport({ devices: [ios(min, "apns")], answeredDeviceIdIfRecipient: null })).toMatchObject({
      ok: false,
      reason: "ios_no_voip",
    });
  });

  it("기기 2대 이상(맥 포함)·기기 없음 → 1단계", () => {
    expect(
      decideCallWaitingSupport({
        devices: [ios(99, "voip_apns", "iphone"), ios(99, "apns", "mac")],
        answeredDeviceIdIfRecipient: null,
      }),
    ).toMatchObject({ ok: false, reason: "multiple_devices" });
    expect(decideCallWaitingSupport({ devices: [], answeredDeviceIdIfRecipient: null })).toMatchObject({
      ok: false,
      reason: "no_active_device",
    });
  });

  it("진행 중 통화를 다른 기기(웹 등)에서 받았으면 1단계", () => {
    expect(decideCallWaitingSupport({ devices: [android(99, "d1")], answeredDeviceIdIfRecipient: "web-x" })).toMatchObject({
      ok: false,
      reason: "live_call_on_other_device",
    });
    expect(decideCallWaitingSupport({ devices: [android(99, "d1")], answeredDeviceIdIfRecipient: "d1" })).toMatchObject({
      ok: true,
    });
  });
});

describe("대기 통화 후보 (WS1)", () => {
  const row = (status: string, answered: string | null) => ({
    id: "s",
    status,
    answered_at: answered,
    initiator_user_id: "a",
    recipient_user_id: "b",
  });
  it("연결된 통화 1건만 후보, 울리는 통화·2건 이상은 아님", () => {
    expect(pickCallWaitingLiveRow([row("active", "2026-11-15T00:00:00Z")])).not.toBeNull();
    expect(pickCallWaitingLiveRow([row("active", null)])).toBeNull();
    expect(pickCallWaitingLiveRow([row("ringing", null)])).toBeNull();
    expect(pickCallWaitingLiveRow([row("active", "x"), row("ringing", null)])).toBeNull();
    expect(pickCallWaitingLiveRow([])).toBeNull();
  });
});

describe("푸시 데이터 waiting (WS1)", () => {
  const out = (meta: Record<string, unknown>) =>
    ({
      user_id: "b",
      notification_type: "community_messenger_incoming_call",
      title: "t",
      body: "b",
      link_url: "/community-messenger/calls/s1",
      meta: { session_id: "s1", room_id: "r1", caller_id: "a", kind: "voice", ...meta },
      occurred_at: "2026-11-15T00:00:00Z",
    }) as unknown as NotificationSideEffectPayloadOut;
  it("waiting=true 일 때만 \"true\", 아니면 키 없음", () => {
    const on = buildFcmDataFields(out({ waiting: true }), { call_push_kind: "incoming_call" }, {});
    const off = buildFcmDataFields(out({}), { call_push_kind: "incoming_call" }, {});
    expect(on.waiting).toBe("true");
    expect("waiting" in off).toBe(false);
  });
});

describe("서버 경로 계약", () => {
  const src = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
  it("발신 판정: 두 분기 모두 대기 통화 판정 → busy 면 1단계, 아니면 waiting 세션", () => {
    expect(src.match(/const peerGate = await resolvePeerCallWaitingGate\(sb, peerUserId, roomId\);/g)?.length).toBe(2);
    expect(src).toContain("...(waitingCall && !isGroupRoom ? { waiting: true } : {}),");
    expect(src).toMatch(/resolveIncomingCallPushDispatchInput\(\s*mappedSession,\s*peerUserId,\s*input\.userId,\s*callDomainEnvelope,\s*waitingCall\s*\)/);
  });
  it("수신 목록 정리(WS3)는 대기 통화를 missed 로 닫지 않음", () => {
    expect(src).toContain("if (row.waiting === true) continue;");
  });
  it("수락(WS5): 다른 연결된 통화가 있으면 other_call_active (끊긴 통화 정리 후 재확인)", () => {
    expect(src).toContain('reconcileUserLiveCallSessions(input.userId, "accept_other_active_guard")');
    expect(src).toContain('return { ok: false, error: "other_call_active" };');
  });
});
