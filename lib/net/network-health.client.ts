/**
 * 기기 네트워크 상태 판정 — 설계 `docs/audit/loading-spinner-network-notice-design-2026-11-22.md` §3-3 (P2).
 *
 * 목적: 네트워크 문제일 때 「DIBAY 문제가 아니라 휴대폰 연결 문제」인지, 반대로 DIBAY 쪽 문제인지 정확히 알린다.
 *
 * 신호 (새 숫자 없음 — 8초 = `NAVIGATION_STALL_DEADLINE_MS`, 하단 탭 계약 v2 승인 값):
 * 1. 기기: `navigator.onLine === false` 또는 네이티브 값 「인터넷 없음」(P3 `readNativeInternetSignal`) → 휴대폰 인터넷 끊김.
 * 2. DIBAY 요청 결과: 전역 fetch 를 **읽기만** 하는 관찰 1개(요청·응답 무변경 — `supabase-call-counter` 와 같은 방식).
 *    대상 = 같은 출처 `/api/**`·Supabase REST 만 · 통화 경로(`call`) 제외(통화 변경 규정) · 미리받기·RSC 제외.
 * 3. 확인 요청 1건: DIBAY 요청이 응답 없이 실패하거나 8초 넘게 멈춘 「사건」마다 1번만, 그 뒤 DIBAY 요청이 1번 성공할 때까지 다시 보내지 않는다.
 *    주소 = OS 가 스스로 쓰는 연결 확인 주소(iPhone `captive.apple.com` · 그 밖 `gstatic.com/generate_204`, 둘 다 HTTPS).
 *    `no-cors`·`no-store`·쿠키 없음·사용자 정보 없음. 운영 Supabase 요청 0건 추가.
 *
 * 판정:
 * - device_offline   : 기기 끊김, 또는 확인 요청도 응답 없이 실패(와이파이는 붙었는데 인터넷이 안 됨)
 * - device_unstable  : 기기 연결은 있는데 확인 요청도 8초 안에 끝나지 않음(느림·끊김)
 * - dibay_unreachable: 확인 요청은 8초 안에 성공했는데 DIBAY 요청만 실패·멈춤
 * - ok               : 기본 · DIBAY 요청이 8초 안에 성공하면 언제든 ok 로 돌아온다
 * DIBAY 5xx 는 전역 상태로 올리지 않는다(한 API 오류를 「DIBAY 전체 장애」로 보지 않음) — 그 화면 문구로만.
 */
import { NAVIGATION_STALL_DEADLINE_MS, isCallPathForNavigationStall } from "@/lib/net/navigation-stall-policy";
import { classifyRequestFailure } from "@/lib/net/classify-request-failure";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

export type NetworkHealthState = "ok" | "device_offline" | "device_unstable" | "dibay_unreachable";

const INSTALLED_MARK = "__dibayNetworkHealthObserver";
const APPLE_CHECK_URL = "https://captive.apple.com/hotspot-detect.html";
const GOOGLE_CHECK_URL = "https://www.gstatic.com/generate_204";

type FetchLike = typeof fetch;

let state: NetworkHealthState = "ok";
const listeners = new Set<() => void>();
/** 확인 요청을 이미 보낸 사건 — DIBAY 요청이 성공하면 풀린다 */
let probeSpent = false;
let probeInFlight = false;

function setState(next: NetworkHealthState): void {
  if (next === state) return;
  state = next;
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* 구독자 오류는 판정에 영향 없음 */
    }
  }
}

export function getNetworkHealthState(): NetworkHealthState {
  return state;
}

export function getNetworkHealthServerState(): NetworkHealthState {
  return "ok";
}

export function subscribeNetworkHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 네이티브 기기 인터넷 값(P3) — Android `DibayBootBridge.internetValidated()` "1"/"0"/"" (OS `NET_CAPABILITY_VALIDATED`) ·
 * iOS `window.__dibayNativeInternet` "0"/"" (`NWPathMonitor` 경로 없음만 확정). 구 바이너리는 값이 없다 → null.
 */
export function readNativeInternetSignal(win: unknown): "validated" | "offline" | null {
  try {
    const w = win as {
      DibayBootBridge?: { internetValidated?: () => unknown };
      __dibayNativeInternet?: unknown;
    } | null;
    if (!w) return null;
    const fn = w.DibayBootBridge?.internetValidated;
    if (typeof fn === "function") {
      const v = String(fn.call(w.DibayBootBridge) ?? "");
      if (v === "0") return "offline";
      if (v === "1") return "validated";
    }
    if (w.__dibayNativeInternet === "0") return "offline";
    return null;
  } catch {
    return null;
  }
}

function deviceReportsOffline(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return typeof window !== "undefined" && readNativeInternetSignal(window) === "offline";
}

export function resolveConnectivityCheckUrl(input: { platform: string | null; userAgent: string }): string {
  if (input.platform === "ios" || /iPhone|iPad|iPod|Macintosh/i.test(input.userAgent)) return APPLE_CHECK_URL;
  return GOOGLE_CHECK_URL;
}

export type NetworkHealthDeps = {
  /** 원래 fetch(관찰 전) — 확인 요청은 관찰 대상이 아니다 */
  rawFetch: FetchLike;
  checkUrl: () => string;
  now: () => number;
  stallMs: number;
};

/** 확인 요청 1건 → 판정. 시험에서 직접 부른다. */
export async function evaluateAfterDibayTrouble(deps: NetworkHealthDeps): Promise<void> {
  if (deviceReportsOffline()) {
    setState("device_offline");
    return;
  }
  if (probeSpent || probeInFlight) return;
  probeInFlight = true;
  probeSpent = true;
  const started = deps.now();
  try {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), deps.stallMs) : null;
    try {
      await deps.rawFetch(deps.checkUrl(), {
        mode: "no-cors",
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
        signal: controller?.signal,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    setState(deps.now() - started >= deps.stallMs ? "device_unstable" : "dibay_unreachable");
  } catch (e) {
    if (deviceReportsOffline()) setState("device_offline");
    else if (classifyRequestFailure(e) === "aborted") setState("device_unstable");
    else setState("device_offline");
  } finally {
    probeInFlight = false;
  }
}

/** DIBAY 요청이 8초 안에 성공 → 정상 복귀 */
export function noteDibayRequestHealthy(): void {
  probeSpent = false;
  setState("ok");
}

function supabaseOrigin(): string | null {
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    return raw ? new URL(raw).origin : null;
  } catch {
    return null;
  }
}

/** 관찰 대상 판정 — 순수 함수(시험 대상) */
export function isObservedDibayRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  env: { pageOrigin: string; supabaseOrigin: string | null }
): boolean {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, env.pageOrigin);
    if (/call/i.test(url.pathname) || isCallPathForNavigationStall(url.pathname)) return false;
    let headers: Headers | null = null;
    try {
      headers = new Headers(init?.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined));
    } catch {
      headers = null;
    }
    if (headers?.get("rsc") || headers?.get("next-router-prefetch") || headers?.get("next-action")) return false;
    if (url.origin === env.pageOrigin) return url.pathname.startsWith("/api/");
    if (env.supabaseOrigin && url.origin === env.supabaseOrigin) return url.pathname.startsWith("/rest/");
    return false;
  } catch {
    return false;
  }
}

/** 관찰 감싸기 — 요청·응답을 바꾸지 않는다(같은 promise 를 그대로 돌려준다) */
export function wrapFetchWithNetworkHealth(inner: FetchLike, deps: NetworkHealthDeps & { isObserved: typeof isObservedDibayRequest; env: () => { pageOrigin: string; supabaseOrigin: string | null } }): FetchLike {
  const observed = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const result = inner.call(this ?? globalThis, input, init);
    try {
      if (!deps.isObserved(input, init, deps.env())) return result;
      const started = deps.now();
      let settled = false;
      const stallTimer = setTimeout(() => {
        if (!settled) void evaluateAfterDibayTrouble(deps);
      }, deps.stallMs);
      result.then(
        (res) => {
          settled = true;
          clearTimeout(stallTimer);
          if (res.status < 500 && deps.now() - started < deps.stallMs) noteDibayRequestHealthy();
        },
        (err: unknown) => {
          settled = true;
          clearTimeout(stallTimer);
          const kind = classifyRequestFailure(err, init?.signal);
          if (kind === "network" || kind === "timeout") void evaluateAfterDibayTrouble(deps);
        }
      );
    } catch {
      /* 관찰 실패는 요청에 영향 없음 */
    }
    return result;
  } as FetchLike;
  for (const key of Object.keys(inner)) {
    (observed as unknown as Record<string, unknown>)[key] = (inner as unknown as Record<string, unknown>)[key];
  }
  (observed as unknown as Record<string, boolean>)[INSTALLED_MARK] = true;
  return observed;
}

export function installNetworkHealthObserver(): void {
  try {
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;
    if ((window.fetch as unknown as Record<string, boolean>)[INSTALLED_MARK]) return;
    const rawFetch = window.fetch.bind(window);
    const sbOrigin = supabaseOrigin();
    const deps: NetworkHealthDeps = {
      rawFetch,
      checkUrl: () =>
        resolveConnectivityCheckUrl({
          platform: resolveCapacitorShellPlatform(),
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      now: () => Date.now(),
      stallMs: NAVIGATION_STALL_DEADLINE_MS,
    };
    window.fetch = wrapFetchWithNetworkHealth(rawFetch, {
      ...deps,
      isObserved: isObservedDibayRequest,
      env: () => ({ pageOrigin: window.location.origin, supabaseOrigin: sbOrigin }),
    });
    if (deviceReportsOffline()) setState("device_offline");
    window.addEventListener("offline", () => setState("device_offline"));
    window.addEventListener("online", () => {
      // 기기가 다시 붙음 — 다음 DIBAY 실패에서 다시 판정한다
      probeSpent = false;
      if (state === "device_offline") setState("ok");
    });
  } catch {
    /* 설치 실패 → 기존 fetch 그대로 */
  }
}

/**
 * 화면 안 오류 문구 — 그 실패의 값으로 고른다(§3-3). 기기·DIBAY 를 아직 가르지 못했으면 기존 공통 문구.
 * 반환값은 카탈로그 키.
 */
export function networkFailureMessageKey(
  failure: unknown
): "net_device_offline" | "net_device_unstable" | "net_dibay_unreachable" | "net_dibay_error" | "common_network_error" {
  const kind = classifyRequestFailure(failure);
  if (kind === "server") return "net_dibay_error";
  if (deviceReportsOffline()) return "net_device_offline";
  if (kind === "network" || kind === "timeout") {
    if (state === "device_offline") return "net_device_offline";
    if (state === "device_unstable") return "net_device_unstable";
    if (state === "dibay_unreachable") return "net_dibay_unreachable";
  }
  return "common_network_error";
}

/** 시험 전용 */
export function __resetNetworkHealthForTest(): void {
  state = "ok";
  probeSpent = false;
  probeInFlight = false;
  listeners.clear();
}
