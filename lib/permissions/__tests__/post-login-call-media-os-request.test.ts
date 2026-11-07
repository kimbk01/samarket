/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = { native: true, shell: "ios" as string };
const os = { mic: "prompt_available", cam: "prompt_available" };
const requestSpy = vi.fn();

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => platform.native,
  resolveCapacitorShellPlatform: () => platform.shell,
}));
vi.mock("@/lib/call/native/native-call-permissions", () => ({
  checkNativeCallOsPermissions: async () => ({ microphone: os.mic, camera: os.cam }),
  requestNativeCallMediaPermissions: (...a: unknown[]) => {
    requestSpy(...a);
    return Promise.resolve({ microphone: "granted", camera: "granted" });
  },
}));

import {
  POST_LOGIN_CALL_MEDIA_PROBE_ID,
  requestPostLoginCallMediaOsPermissions,
} from "@/lib/permissions/post-login-call-media-os-request";

describe("로그인 직후 iOS 마이크·카메라 OS 창", () => {
  beforeEach(() => {
    platform.native = true;
    platform.shell = "ios";
    os.mic = "prompt_available";
    os.cam = "prompt_available";
    requestSpy.mockReset();
  });

  it("새 설치 — 마이크·카메라(video) 한 번 요청", async () => {
    expect(await requestPostLoginCallMediaOsPermissions()).toBe("requested");
    expect(requestSpy).toHaveBeenCalledWith("video", POST_LOGIN_CALL_MEDIA_PROBE_ID);
  });

  it("카메라만 정해졌으면 voice 로 마이크만", async () => {
    os.cam = "granted";
    await requestPostLoginCallMediaOsPermissions();
    expect(requestSpy).toHaveBeenCalledWith("voice", POST_LOGIN_CALL_MEDIA_PROBE_ID);
  });

  it("모두 정해졌으면(거부 포함) 다시 묻지 않음", async () => {
    os.mic = "permanently_denied";
    os.cam = "granted";
    expect(await requestPostLoginCallMediaOsPermissions()).toBe("already_decided");
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("Android·웹 브라우저는 아무것도 안 함", async () => {
    platform.shell = "android";
    expect(await requestPostLoginCallMediaOsPermissions()).toBe("skipped_not_ios");
    platform.native = false;
    platform.shell = "web";
    expect(await requestPostLoginCallMediaOsPermissions()).toBe("skipped_not_ios");
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
