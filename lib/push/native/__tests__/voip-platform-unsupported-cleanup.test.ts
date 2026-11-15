// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D2-1 (docs/audit/mac-ipad-call-and-bottom-bar-audit-2026-11-15.md §10)
 * 맥(voipPush=false) → 이 기기 voip_apns 행만 비활성 요청. iPhone·구 바이너리 → 요청 없음.
 */
const h = vi.hoisted(() => ({
  capability: null as null | { voipPush?: boolean },
  capabilityThrows: false,
}));

vi.mock("@/lib/platform/capacitor-native", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, hasLikelyIosCapacitorShell: () => true };
});
vi.mock("@/lib/auth/client-instance-id", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, ensureClientInstanceId: () => "mac-device-1" };
});
vi.mock("@/lib/auth/dibay-session-manager", () => ({
  subscribeDibayAuthStateChange: () => () => undefined,
}));
vi.mock("@/lib/push/native/dibay-voip-call-plugin", () => ({
  dibayVoipCallPlugin: {
    replayLastVoipToken: async () => ({ ok: true }),
    getCallPlatformCapability: async () => {
      if (h.capabilityThrows) throw new Error("not implemented");
      return h.capability ?? {};
    },
  },
}));

import {
  attachVoipPushTokenListener,
  resetNativePushOrchestrationForTests,
} from "@/lib/push/native/register-native-push-client";

const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));

async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe("D2-1 voip platform-unsupported cleanup", () => {
  let detach: () => void = () => undefined;
  beforeEach(() => {
    resetNativePushOrchestrationForTests();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    h.capability = null;
    h.capabilityThrows = false;
  });
  afterEach(() => {
    detach();
    vi.unstubAllGlobals();
  });

  it("맥(voipPush=false): 이 기기 voip_apns 만 비활성 요청", async () => {
    h.capability = { voipPush: false };
    detach = attachVoipPushTokenListener();
    await flush();
    const calls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/me/devices/deactivate"));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String((calls[0][1] as RequestInit).body))).toEqual({
      device_id: "mac-device-1",
      push_provider: "voip_apns",
    });
  });

  it("iPhone·iPad(voipPush=true): 비활성 요청 없음", async () => {
    h.capability = { voipPush: true };
    detach = attachVoipPushTokenListener();
    await flush();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("deactivate"))).toHaveLength(0);
  });

  it("구 바이너리(능력 조회 없음): 비활성 요청 없음", async () => {
    h.capabilityThrows = true;
    detach = attachVoipPushTokenListener();
    await flush();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("deactivate"))).toHaveLength(0);
  });
});
