import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => true,
  resolveCapacitorShellPlatform: () => "android",
}));

import {
  decideNativeCallBar,
  formatNativeCallBarDuration,
  nativeCallBarTapFollowUp,
  type NativeCallBarInput,
} from "@/lib/call/native/native-active-call-bar";
import {
  bringNativeActiveCallToFrontChecked,
  isNativeBringActiveCallToFrontSupported,
  probeNativeActiveCallId,
} from "@/lib/call/native/native-call-service";

const base: NativeCallBarInput = {
  supported: true,
  phase: "connected",
  storeCallId: "call-1",
  probe: { kind: "active", callId: "call-1" },
  wasVisible: false,
  suppressed: false,
};

describe("decideNativeCallBar — 표시 = 지원 바이너리 · connected · 네이티브 같은 callId", () => {
  it("모두 참이면 표시", () => {
    expect(decideNativeCallBar(base)).toEqual({ visible: true, suppressAndReconcile: false });
  });

  it("구 바이너리(복귀 미지원)는 표시 안 함", () => {
    expect(decideNativeCallBar({ ...base, supported: false }).visible).toBe(false);
  });

  it("웹 스토어가 connected 가 아니면 표시 안 함", () => {
    for (const phase of ["idle", "outgoing_ringing", "incoming_ringing", "ending"]) {
      expect(decideNativeCallBar({ ...base, phase }).visible).toBe(false);
    }
  });

  it("「통화 없음」 정상 응답이면 숨기고 서버 확인", () => {
    expect(decideNativeCallBar({ ...base, wasVisible: true, probe: { kind: "none" } })).toEqual({
      visible: false,
      suppressAndReconcile: true,
    });
  });

  it("네이티브가 다른 통화를 가지면 이 callId 는 숨기고 서버 확인", () => {
    expect(
      decideNativeCallBar({ ...base, wasVisible: true, probe: { kind: "active", callId: "call-2" } }),
    ).toEqual({ visible: false, suppressAndReconcile: true });
  });

  it("조회 실패(unknown)는 종료로 보지 않고 현재 표시 상태 유지", () => {
    expect(decideNativeCallBar({ ...base, wasVisible: true, probe: { kind: "unknown" } })).toEqual({
      visible: true,
      suppressAndReconcile: false,
    });
    expect(decideNativeCallBar({ ...base, wasVisible: false, probe: { kind: "unknown" } })).toEqual({
      visible: false,
      suppressAndReconcile: false,
    });
  });

  it("확인 전(probe null)에는 직전 상태 유지", () => {
    expect(decideNativeCallBar({ ...base, probe: null }).visible).toBe(false);
  });

  it("「통화 없음」으로 확정된 callId 는 다시 표시하지 않음", () => {
    expect(decideNativeCallBar({ ...base, suppressed: true }).visible).toBe(false);
  });
});

describe("nativeCallBarTapFollowUp — 탭은 이동·재발신 없음", () => {
  it("not_shown 일 때만 네이티브 재확인", () => {
    expect(nativeCallBarTapFollowUp("shown")).toBe("done");
    expect(nativeCallBarTapFollowUp("unknown")).toBe("done");
    expect(nativeCallBarTapFollowUp("not_shown")).toBe("probe");
  });
});

describe("formatNativeCallBarDuration", () => {
  it("mm:ss · 1시간 이상 h:mm:ss · 기준 없음 00:00", () => {
    expect(formatNativeCallBarDuration(1_000, 1_000 + 204_000)).toBe("03:24");
    expect(formatNativeCallBarDuration(1_000, 1_000 + 3_725_000)).toBe("1:02:05");
    expect(formatNativeCallBarDuration(null, 5_000)).toBe("00:00");
  });
});

type CapWindow = Window & {
  Capacitor?: {
    PluginHeaders?: Array<{ name: string; methods: Array<{ name: string }> }>;
    nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
  };
};

describe("네이티브 확인 3상태 (probeNativeActiveCallId / bringNativeActiveCallToFrontChecked)", () => {
  const w = globalThis as unknown as { window?: CapWindow };
  let nativePromise: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nativePromise = vi.fn();
    w.window = {
      Capacitor: {
        PluginHeaders: [
          { name: "NativeCallService", methods: [{ name: "getActiveCallId" }, { name: "bringActiveCallToFront" }] },
        ],
        nativePromise,
      },
    } as unknown as CapWindow;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete w.window;
  });

  it("Android 통화 없음 `{}` · iOS `{ callId: null }` → none", async () => {
    nativePromise.mockResolvedValueOnce({});
    expect(await probeNativeActiveCallId()).toEqual({ kind: "none" });
    nativePromise.mockResolvedValueOnce({ callId: null });
    expect(await probeNativeActiveCallId()).toEqual({ kind: "none" });
    nativePromise.mockResolvedValueOnce({ callId: "  " });
    expect(await probeNativeActiveCallId()).toEqual({ kind: "none" });
  });

  it("callId 있음 → active", async () => {
    nativePromise.mockResolvedValueOnce({ callId: " call-1 " });
    expect(await probeNativeActiveCallId()).toEqual({ kind: "active", callId: "call-1" });
  });

  it("브리지 예외·형식 오류·시간 초과 → unknown (종료 아님)", async () => {
    nativePromise.mockRejectedValueOnce(new Error("bridge"));
    expect(await probeNativeActiveCallId()).toEqual({ kind: "unknown" });
    nativePromise.mockResolvedValueOnce(null);
    expect(await probeNativeActiveCallId()).toEqual({ kind: "unknown" });
    nativePromise.mockResolvedValueOnce({ callId: 42 });
    expect(await probeNativeActiveCallId()).toEqual({ kind: "unknown" });

    vi.useFakeTimers();
    nativePromise.mockReturnValueOnce(new Promise(() => undefined));
    const pending = probeNativeActiveCallId();
    await vi.advanceTimersByTimeAsync(1600);
    expect(await pending).toEqual({ kind: "unknown" });
  });

  it("복귀 지원 판별은 설치 바이너리 PluginHeaders 기준", () => {
    expect(isNativeBringActiveCallToFrontSupported()).toBe(true);
    w.window!.Capacitor!.PluginHeaders = [{ name: "NativeCallService", methods: [{ name: "getActiveCallId" }] }];
    expect(isNativeBringActiveCallToFrontSupported()).toBe(false);
  });

  it("복귀 결과 3상태 · 미지원 바이너리는 호출하지 않음", async () => {
    nativePromise.mockResolvedValueOnce({ shown: true });
    expect(await bringNativeActiveCallToFrontChecked()).toBe("shown");
    nativePromise.mockResolvedValueOnce({ shown: false });
    expect(await bringNativeActiveCallToFrontChecked()).toBe("not_shown");
    nativePromise.mockRejectedValueOnce(new Error("bridge"));
    expect(await bringNativeActiveCallToFrontChecked()).toBe("unknown");

    w.window!.Capacitor!.PluginHeaders = [];
    nativePromise.mockClear();
    expect(await bringNativeActiveCallToFrontChecked()).toBe("unknown");
    expect(nativePromise).not.toHaveBeenCalled();
  });
});
