/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = { native: true, shell: "ios" as string };
const os = { mic: "prompt_available" as string, cam: "prompt_available" as string };
const notif = { receiveReady: false, canPrompt: true };
const mediaSpy = vi.fn();
const notifSpy = vi.fn();
const order: string[] = [];

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => platform.native,
  resolveCapacitorShellPlatform: () => platform.shell,
}));

vi.mock("@/lib/call/native/native-call-permissions", () => ({
  checkNativeCallOsPermissions: async () => ({ microphone: os.mic, camera: os.cam }),
  requestNativeCallMediaPermissions: (...args: unknown[]) => {
    order.push("media");
    mediaSpy(...args);
    return Promise.resolve({ microphone: "granted", camera: "granted" });
  },
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-manager", () => ({
  syncNotificationState: async () => ({ receiveReady: notif.receiveReady, effectiveState: "UNKNOWN" }),
  canRequestOsNotificationPrompt: () => notif.canPrompt,
  requestNotificationFromGuide: () => {
    order.push("notification");
    notifSpy();
    return Promise.resolve({ ok: true });
  },
}));

import {
  IOS_MIC_PREASK_PROBE_ID,
  IOS_MIC_PREASK_SESSION_KEY,
  hasAnyPreaskNeed,
  markIosMicPreaskShown,
  requestIosPermissionsFromPreask,
  resolveIosPermissionPreaskNeeds,
} from "@/lib/community-messenger/ios-mic-preask";

describe("ios-mic-preask (알림·마이크·카메라)", () => {
  beforeEach(() => {
    platform.native = true;
    platform.shell = "ios";
    os.mic = "prompt_available";
    os.cam = "prompt_available";
    notif.receiveReady = false;
    notif.canPrompt = true;
    mediaSpy.mockReset();
    notifSpy.mockReset();
    order.length = 0;
    window.sessionStorage.removeItem(IOS_MIC_PREASK_SESSION_KEY);
  });

  it("새 설치 — 세 가지 모두 묻기", async () => {
    expect(await resolveIosPermissionPreaskNeeds()).toEqual({ notification: true, microphone: true, camera: true });
  });

  it("이미 정해진 권한은 빼고 남은 것만", async () => {
    notif.receiveReady = true;
    os.mic = "granted";
    expect(await resolveIosPermissionPreaskNeeds()).toEqual({ notification: false, microphone: false, camera: true });
  });

  it("모두 정해졌으면 안내 없음 (거부 포함)", async () => {
    notif.canPrompt = false;
    os.mic = "permanently_denied";
    os.cam = "granted";
    expect(hasAnyPreaskNeed(await resolveIosPermissionPreaskNeeds())).toBe(false);
  });

  it("Android·웹 브라우저는 안내 없음", async () => {
    platform.shell = "android";
    expect(hasAnyPreaskNeed(await resolveIosPermissionPreaskNeeds())).toBe(false);
    platform.native = false;
    platform.shell = "web";
    expect(hasAnyPreaskNeed(await resolveIosPermissionPreaskNeeds())).toBe(false);
  });

  it("이번 실행에서 한 번 띄웠으면 다시 안 띄움", async () => {
    markIosMicPreaskShown();
    expect(hasAnyPreaskNeed(await resolveIosPermissionPreaskNeeds())).toBe(false);
  });

  it("계속 → 알림 먼저, 그다음 마이크+카메라(video) 한 번", async () => {
    await requestIosPermissionsFromPreask({ notification: true, microphone: true, camera: true });
    expect(order).toEqual(["notification", "media"]);
    expect(mediaSpy).toHaveBeenCalledWith("video", IOS_MIC_PREASK_PROBE_ID);
  });

  it("카메라가 필요 없으면 voice 로 마이크만", async () => {
    await requestIosPermissionsFromPreask({ notification: false, microphone: true, camera: false });
    expect(notifSpy).not.toHaveBeenCalled();
    expect(mediaSpy).toHaveBeenCalledWith("voice", IOS_MIC_PREASK_PROBE_ID);
  });

  it("iOS 가 아니면 아무것도 요청 안 함", async () => {
    platform.shell = "android";
    await requestIosPermissionsFromPreask({ notification: true, microphone: true, camera: true });
    expect(order).toEqual([]);
  });
});
