/**
 * 2026-11-19 맥·태블릿 하단 메뉴 결함 — 설계 D1·D2·D3 (`docs/audit/mac-bottom-nav-device-class-2026-11-19.md`, Owner 승인).
 * 네이티브 판정 실패(`UNKNOWN`)가 그 실행 내내 고정돼 하단 메뉴로 굳던 경로를 막는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DIBAY_DEVICE_CLASS_RETRY_DELAYS_MS,
  peekDibayDeviceClassSession,
  resetDibayDeviceClassSessionForTests,
  resolveDibayDeviceClass,
  startDibayDeviceClassResolution,
  type DibayDeviceClassResult,
} from "@/lib/device/dibay-device-class";
import { readNativeDibayDeviceClass } from "@/lib/device/dibay-device-class-native";
import { dibayUsesSideRail } from "@/lib/device/dibay-device-profile";
import { sanitizeEntryTelemetryEvent, ENTRY_TELEMETRY_SCHEMA_VERSION } from "@/lib/telemetry/entry-telemetry-contract";

vi.mock("@/lib/platform/capacitor-native", () => ({
  resolveCapacitorShellPlatform: vi.fn(() => "ios"),
  isCapacitorBridgeReady: vi.fn(() => true),
  waitForCapacitorBridgeReady: vi.fn(async () => true),
}));

vi.mock("@/lib/device/dibay-device-class-native", () => ({
  readNativeDibayDeviceClass: vi.fn(async () => null),
}));

const nativeMock = vi.mocked(readNativeDibayDeviceClass);
const MAC: DibayDeviceClassResult = { deviceClass: "DESKTOP_MAC", source: "ios_app_on_mac" } as DibayDeviceClassResult;

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetDibayDeviceClassSessionForTests();
  nativeMock.mockReset();
  nativeMock.mockResolvedValue(null);
});

describe("D1 — 판정 실패(UNKNOWN)는 이번 실행에 고정하지 않는다", () => {
  it("실패 → 다음 호출에서 다시 네이티브에 묻고, 성공하면 그때 고정", async () => {
    nativeMock.mockResolvedValueOnce(null).mockResolvedValueOnce(MAC);
    const first = await resolveDibayDeviceClass();
    expect(first.deviceClass).toBe("UNKNOWN");
    expect(peekDibayDeviceClassSession()).toBeNull();
    const second = await resolveDibayDeviceClass();
    expect(second.deviceClass).toBe("DESKTOP_MAC");
    expect(peekDibayDeviceClassSession()?.deviceClass).toBe("DESKTOP_MAC");
    await resolveDibayDeviceClass();
    expect(nativeMock).toHaveBeenCalledTimes(2);
  });
});

describe("D2 — 정해진 횟수만 다시 판정 (1·2·4초 + 복귀 1회)", () => {
  it("재시도 간격 = 1초·2초·4초", () => {
    expect([...DIBAY_DEVICE_CLASS_RETRY_DELAYS_MS]).toEqual([1_000, 2_000, 4_000]);
  });

  it("처음 실패 → 1초 뒤 성공 → DESKTOP_MAC 로 알리고 멈춘다(맥 = 세로 메뉴)", async () => {
    nativeMock.mockResolvedValueOnce(null).mockResolvedValueOnce(MAC);
    const seen: string[] = [];
    const stop = startDibayDeviceClassResolution((r) => seen.push(r.deviceClass));
    await flush();
    expect(seen).toEqual(["UNKNOWN"]);
    await vi.advanceTimersByTimeAsync(1_000);
    await flush();
    expect(seen).toEqual(["UNKNOWN", "DESKTOP_MAC"]);
    expect(dibayUsesSideRail("DESKTOP_MAC", { widthCss: 1024, heightCss: 768 })).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(nativeMock).toHaveBeenCalledTimes(2);
    stop();
  });

  it("계속 실패해도 처음 1회 + 3회에서 멈춘다 — 무한 반복 없음, 같은 결과는 다시 알리지 않음", async () => {
    const seen: string[] = [];
    const stop = startDibayDeviceClassResolution((r) => seen.push(r.deviceClass));
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(nativeMock).toHaveBeenCalledTimes(4);
    expect(seen).toEqual(["UNKNOWN"]);
    stop();
  });

  it("3회 재시도가 끝난 뒤에도 앱이 앞으로 돌아오면 1회 더 묻는다(1회만)", async () => {
    let handler: (() => void) | null = null;
    const doc = {
      visibilityState: "visible",
      addEventListener: (_: string, fn: () => void) => {
        handler = fn;
      },
      removeEventListener: () => {
        handler = null;
      },
    };
    vi.stubGlobal("document", doc);
    const seen: string[] = [];
    const stop = startDibayDeviceClassResolution((r) => seen.push(r.deviceClass));
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(nativeMock).toHaveBeenCalledTimes(4);
    nativeMock.mockResolvedValueOnce(MAC);
    (handler as (() => void) | null)?.();
    await flush();
    expect(nativeMock).toHaveBeenCalledTimes(5);
    expect(seen).toEqual(["UNKNOWN", "DESKTOP_MAC"]);
    (handler as (() => void) | null)?.();
    await flush();
    expect(nativeMock).toHaveBeenCalledTimes(5);
    stop();
    vi.unstubAllGlobals();
  });

  it("멈춘 뒤에는 더 묻지 않는다", async () => {
    const stop = startDibayDeviceClassResolution(() => {});
    await flush();
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(nativeMock).toHaveBeenCalledTimes(1);
  });
});

describe("D3 — 진입 계측에 기기 판정·메뉴 형태·창 폭 (새 요청 없음)", () => {
  const base = {
    v: ENTRY_TELEMETRY_SCHEMA_VERSION,
    run: "r1",
    seq: 1,
    kind: "cold",
    ev: "resume",
    platform: "ios",
    ageMs: 10,
  };

  it("계약 필드로 받아 남긴다", () => {
    const ev = sanitizeEntryTelemetryEvent({
      ...base,
      deviceClass: "UNKNOWN",
      deviceClassSource: "native_plugin_unavailable",
      nav: "bottom",
      usableWidth: 1100,
    });
    if (!ev) throw new Error("sanitize returned null — check base fields");
    expect(ev.deviceClass).toBe("UNKNOWN");
    expect(ev.deviceClassSource).toBe("native_plugin_unavailable");
    expect(ev.nav).toBe("bottom");
    expect(ev.usableWidth).toBe(1100);
  });

  it("셸이 없으면 null, 이상한 값은 버린다", () => {
    const ev = sanitizeEntryTelemetryEvent({ ...base, nav: "side", usableWidth: -1, deviceClass: "x y" });
    if (!ev) throw new Error("sanitize returned null — check base fields");
    expect(ev.nav).toBeNull();
    expect(ev.usableWidth).toBeNull();
    expect(ev.deviceClass).toBeNull();
  });

  it("셸 훅이 사진을 갱신하고 계측이 보낼 때 붙인다 · DB 저장 열은 그대로", () => {
    const hook = readFileSync(resolve(process.cwd(), "lib/device/use-dibay-app-shell.ts"), "utf8");
    expect(hook).toContain("startDibayDeviceClassResolution(");
    expect(hook).toContain("setDibayShellSnapshot({");
    const client = readFileSync(resolve(process.cwd(), "lib/telemetry/entry-telemetry.client.ts"), "utf8");
    expect(client).toContain("...readShellFields(),");
    const store = readFileSync(resolve(process.cwd(), "lib/telemetry/entry-failure-store.server.ts"), "utf8");
    expect(store).not.toContain("deviceClass");
  });
});
