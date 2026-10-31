import { afterEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ native: true }));

vi.mock("@/lib/platform/capacitor-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform/capacitor-native")>();
  return { ...actual, isCapacitorNativePlatform: () => platform.native };
});

import {
  isNativeCallTerminationPolicySupported,
  toNativeUnconfirmedEndReason,
} from "@/lib/call/native/native-call-service";

function setPluginMethods(methods: string[] | null): void {
  if (methods == null) {
    vi.unstubAllGlobals();
    return;
  }
  vi.stubGlobal("window", {
    Capacitor: { PluginHeaders: [{ name: "NativeCallService", methods: methods.map((name) => ({ name })) }] },
  });
}

/** call-termination-authority-audit §5 — 새 앱(판단 함수 보유)만 새 동작, 구 바이너리는 기존 동작. */
describe("isNativeCallTerminationPolicySupported", () => {
  afterEach(() => {
    setPluginMethods(null);
    platform.native = true;
  });

  it("앱 플러그인 헤더에 getCallTerminationPolicy 가 있으면 true", () => {
    setPluginMethods(["endCall", "getCallTerminationPolicy"]);
    expect(isNativeCallTerminationPolicySupported()).toBe(true);
  });

  it("구 바이너리(메서드 없음)는 false", () => {
    setPluginMethods(["endCall", "bringActiveCallToFront"]);
    expect(isNativeCallTerminationPolicySupported()).toBe(false);
  });

  it("웹(네이티브 아님)은 false", () => {
    platform.native = false;
    setPluginMethods(["getCallTerminationPolicy"]);
    expect(isNativeCallTerminationPolicySupported()).toBe(false);
  });

  it("미확인 사유는 네이티브 서버 확정 목록에 없는 접두사", () => {
    expect(toNativeUnconfirmedEndReason("rejected")).toBe("unconfirmed_rejected");
    expect(toNativeUnconfirmedEndReason(" ")).toBe("unconfirmed_terminal");
  });
});
