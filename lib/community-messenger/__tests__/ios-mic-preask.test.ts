/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = { native: true, shell: "ios" as string };
const osMic = { value: "prompt_available" as string };
const requestSpy = vi.fn();

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => platform.native,
  resolveCapacitorShellPlatform: () => platform.shell,
}));

vi.mock("@/lib/call/native/native-call-permissions", () => ({
  checkNativeCallOsPermissions: async () => ({ microphone: osMic.value, camera: "unknown" }),
  requestNativeCallMediaPermissions: (...args: unknown[]) => {
    requestSpy(...args);
    return Promise.resolve({ microphone: "granted", camera: "unknown" });
  },
}));

import {
  IOS_MIC_PREASK_PROBE_ID,
  IOS_MIC_PREASK_SESSION_KEY,
  markIosMicPreaskShown,
  requestIosMicFromPreask,
  shouldShowIosMicPreask,
} from "@/lib/community-messenger/ios-mic-preask";

describe("ios-mic-preask", () => {
  beforeEach(() => {
    platform.native = true;
    platform.shell = "ios";
    osMic.value = "prompt_available";
    requestSpy.mockReset();
    window.sessionStorage.removeItem(IOS_MIC_PREASK_SESSION_KEY);
  });

  it("iOS 앱 + 마이크 아직 안 물어봄 → 안내", async () => {
    expect(await shouldShowIosMicPreask()).toBe(true);
  });

  it("이미 허용·거부면 안내 안 함", async () => {
    osMic.value = "granted";
    expect(await shouldShowIosMicPreask()).toBe(false);
    osMic.value = "permanently_denied";
    expect(await shouldShowIosMicPreask()).toBe(false);
  });

  it("Android·웹 브라우저는 안내 안 함", async () => {
    platform.shell = "android";
    expect(await shouldShowIosMicPreask()).toBe(false);
    platform.native = false;
    platform.shell = "web";
    expect(await shouldShowIosMicPreask()).toBe(false);
  });

  it("이번 실행에서 한 번 띄웠으면 다시 안 띄움", async () => {
    markIosMicPreaskShown();
    expect(await shouldShowIosMicPreask()).toBe(false);
  });

  it("계속 → iOS 음성 권한 요청(통화 세션 아님 식별값)", async () => {
    await requestIosMicFromPreask();
    expect(requestSpy).toHaveBeenCalledWith("voice", IOS_MIC_PREASK_PROBE_ID);
  });

  it("iOS 가 아니면 요청 안 함", async () => {
    platform.shell = "android";
    await requestIosMicFromPreask();
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
