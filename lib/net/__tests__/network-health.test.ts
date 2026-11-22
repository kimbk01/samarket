import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyRequestFailure } from "@/lib/net/classify-request-failure";
import {
  __resetNetworkHealthForTest,
  evaluateAfterDibayTrouble,
  getNetworkHealthState,
  isObservedDibayRequest,
  networkFailureMessageKey,
  noteDibayRequestHealthy,
  readNativeInternetSignal,
  resolveConnectivityCheckUrl,
  wrapFetchWithNetworkHealth,
  type NetworkHealthDeps,
} from "@/lib/net/network-health.client";

const ENV = { pageOrigin: "https://samarket.vercel.app", supabaseOrigin: "https://abc.supabase.co" };

function setOnline(v: boolean) {
  Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => v });
}

function deps(probe: () => Promise<unknown>, clock: { t: number }): NetworkHealthDeps {
  return {
    rawFetch: vi.fn(() => probe()) as unknown as typeof fetch,
    checkUrl: () => "https://www.gstatic.com/generate_204",
    now: () => clock.t,
    stallMs: 8000,
  };
}

beforeEach(() => {
  __resetNetworkHealthForTest();
  setOnline(true);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("classifyRequestFailure — 그 실패의 값으로만", () => {
  it("TypeError = network · 5xx·깨진 JSON = server · 4xx = client · 취소 = aborted · 시간 초과 = timeout", () => {
    expect(classifyRequestFailure(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyRequestFailure({ status: 503 })).toBe("server");
    expect(classifyRequestFailure(new SyntaxError("Unexpected token"))).toBe("server");
    expect(classifyRequestFailure({ status: 404 })).toBe("client");
    expect(classifyRequestFailure(new DOMException("x", "AbortError"))).toBe("aborted");
    expect(classifyRequestFailure(new DOMException("x", "TimeoutError"))).toBe("timeout");
  });
});

describe("판정 — 기기 vs DIBAY", () => {
  it("기기 offline → 확인 요청 없이 device_offline", async () => {
    setOnline(false);
    const clock = { t: 0 };
    const d = deps(() => Promise.resolve({}), clock);
    await evaluateAfterDibayTrouble(d);
    expect(getNetworkHealthState()).toBe("device_offline");
    expect(d.rawFetch).not.toHaveBeenCalled();
  });
  it("확인 요청도 응답 없이 실패 → device_offline (와이파이만 붙고 인터넷 없음)", async () => {
    await evaluateAfterDibayTrouble(deps(() => Promise.reject(new TypeError("Failed to fetch")), { t: 0 }));
    expect(getNetworkHealthState()).toBe("device_offline");
  });
  it("확인 요청이 8초 안에 성공 → dibay_unreachable (휴대폰 탓 아님)", async () => {
    await evaluateAfterDibayTrouble(deps(() => Promise.resolve({}), { t: 0 }));
    expect(getNetworkHealthState()).toBe("dibay_unreachable");
  });
  it("확인 요청이 8초 넘게 걸림 → device_unstable", async () => {
    const clock = { t: 0 };
    await evaluateAfterDibayTrouble(
      deps(async () => {
        clock.t = 9000;
        return {};
      }, clock)
    );
    expect(getNetworkHealthState()).toBe("device_unstable");
  });
  it("확인 요청은 사건당 1번 — DIBAY 요청이 성공해야 다시 보낸다 · 성공하면 ok", async () => {
    const d = deps(() => Promise.resolve({}), { t: 0 });
    await evaluateAfterDibayTrouble(d);
    await evaluateAfterDibayTrouble(d);
    expect(d.rawFetch).toHaveBeenCalledTimes(1);
    noteDibayRequestHealthy();
    expect(getNetworkHealthState()).toBe("ok");
    await evaluateAfterDibayTrouble(d);
    expect(d.rawFetch).toHaveBeenCalledTimes(2);
  });
});

describe("관찰 — 요청·응답 무변경", () => {
  it("대상: 같은 출처 /api · Supabase REST / 제외: 통화·RSC·미리받기·외부", () => {
    expect(isObservedDibayRequest("/api/posts", undefined, ENV)).toBe(true);
    expect(isObservedDibayRequest("https://abc.supabase.co/rest/v1/posts", undefined, ENV)).toBe(true);
    expect(isObservedDibayRequest("/api/community-messenger/calls/abc", undefined, ENV)).toBe(false);
    expect(isObservedDibayRequest("/market", { headers: { rsc: "1" } }, ENV)).toBe(false);
    expect(isObservedDibayRequest("/api/x", { headers: { "next-router-prefetch": "1" } }, ENV)).toBe(false);
    expect(isObservedDibayRequest("https://example.com/api/x", undefined, ENV)).toBe(false);
  });
  it("같은 promise 를 그대로 돌려주고, 실패하면 판정을 돌린다", async () => {
    const failing = Promise.reject(new TypeError("Failed to fetch"));
    failing.catch(() => undefined);
    const inner = vi.fn(() => failing) as unknown as typeof fetch;
    const probe = vi.fn(() => Promise.resolve({}));
    const wrapped = wrapFetchWithNetworkHealth(inner, {
      ...deps(probe, { t: 0 }),
      rawFetch: probe as unknown as typeof fetch,
      isObserved: isObservedDibayRequest,
      env: () => ENV,
    });
    const got = wrapped("/api/posts");
    expect(got).toBe(failing);
    await expect(got).rejects.toBeInstanceOf(TypeError);
    await vi.waitFor(() => expect(getNetworkHealthState()).toBe("dibay_unreachable"));
  });
  it("8초 넘게 응답이 없으면 판정 · 성공(8초 안)이면 ok", async () => {
    vi.useFakeTimers();
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((r) => (resolve = r));
    const probe = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const clock = { t: 0 };
    const wrapped = wrapFetchWithNetworkHealth((() => pending) as unknown as typeof fetch, {
      ...deps(probe, clock),
      rawFetch: probe as unknown as typeof fetch,
      isObserved: isObservedDibayRequest,
      env: () => ENV,
    });
    void wrapped("/api/slow");
    await vi.advanceTimersByTimeAsync(8000);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(getNetworkHealthState()).toBe("device_offline");
    const ok = wrapFetchWithNetworkHealth((() => Promise.resolve(new Response(null, { status: 200 }))) as unknown as typeof fetch, {
      ...deps(probe, clock),
      isObserved: isObservedDibayRequest,
      env: () => ENV,
    });
    await ok("/api/fast");
    await vi.advanceTimersByTimeAsync(0);
    expect(getNetworkHealthState()).toBe("ok");
    resolve(new Response(null, { status: 200 }));
  });
});

describe("화면 문구 키", () => {
  it("5xx = DIBAY 오류 · 기기 끊김 = 휴대폰 문구 · 아직 모름 = 기존 공통 문구", async () => {
    expect(networkFailureMessageKey({ status: 502 })).toBe("net_dibay_error");
    expect(networkFailureMessageKey(new TypeError("Failed to fetch"))).toBe("common_network_error");
    await evaluateAfterDibayTrouble(deps(() => Promise.resolve({}), { t: 0 }));
    expect(networkFailureMessageKey(new TypeError("Failed to fetch"))).toBe("net_dibay_unreachable");
    setOnline(false);
    expect(networkFailureMessageKey(new TypeError("Failed to fetch"))).toBe("net_device_offline");
  });
  it("확인 주소: iPhone = Apple · 그 밖 = Google (둘 다 HTTPS)", () => {
    expect(resolveConnectivityCheckUrl({ platform: "ios", userAgent: "" })).toBe("https://captive.apple.com/hotspot-detect.html");
    expect(resolveConnectivityCheckUrl({ platform: "android", userAgent: "Android" })).toBe("https://www.gstatic.com/generate_204");
  });
});

describe("네이티브 기기 인터넷 값 (P3)", () => {
  it("Android 브리지 0/1 · iOS 값 0 · 구 바이너리 = 모름", () => {
    expect(readNativeInternetSignal({ DibayBootBridge: { internetValidated: () => "0" } })).toBe("offline");
    expect(readNativeInternetSignal({ DibayBootBridge: { internetValidated: () => "1" } })).toBe("validated");
    expect(readNativeInternetSignal({ __dibayNativeInternet: "0" })).toBe("offline");
    expect(readNativeInternetSignal({ __dibayNativeInternet: "" })).toBeNull();
    expect(readNativeInternetSignal({ DibayBootBridge: { dismissSplash: () => undefined } })).toBeNull();
  });
  it("네이티브가 「인터넷 없음」이면 확인 요청 없이 device_offline", async () => {
    const g = globalThis as unknown as { window?: unknown };
    const had = "window" in g;
    const prev = g.window;
    g.window = { __dibayNativeInternet: "0" };
    const d = deps(() => Promise.resolve({}), { t: 0 });
    await evaluateAfterDibayTrouble(d);
    expect(getNetworkHealthState()).toBe("device_offline");
    expect(d.rawFetch).not.toHaveBeenCalled();
    if (had) g.window = prev;
    else delete g.window;
  });
});
