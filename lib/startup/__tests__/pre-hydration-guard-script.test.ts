// @vitest-environment jsdom
/**
 * C2 — hydration 전 청크 실패 초기 가드: 빌드당 새로고침 1회 → 이후 오류 안내+해제, 마운트 후 무동작, 타이머 없음.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPreHydrationGuardScript,
  ENTRY_TELEMETRY_RECOVERY_KEY,
  ENTRY_TELEMETRY_RELOADS_KEY,
  PRE_HYDRATION_GUARD_RELOADED_SHA_KEY,
} from "@/lib/startup/pre-hydration-guard-script";

type Listener = { type: string; fn: EventListenerOrEventListenerObject; capture: boolean };

let added: Listener[] = [];
let reload: ReturnType<typeof vi.fn>;
let dismissSplash: ReturnType<typeof vi.fn>;
let beacons: string[] = [];
const realAdd = window.addEventListener.bind(window);

/** 문서 1개를 흉내: 가드 스크립트를 새로 실행 (location 은 가짜로 주입). */
function runGuard(sha = "abc1234"): void {
  window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
    added.push({ type, fn, capture: opts === true || (typeof opts === "object" && !!opts?.capture) });
    realAdd(type, fn, opts);
  }) as typeof window.addEventListener;
  new Function("location", buildPreHydrationGuardScript(sha))({ reload });
  window.addEventListener = realAdd as typeof window.addEventListener;
}

function failScript(src = "/_next/static/chunks/main-app.js"): void {
  const el = document.createElement("script");
  el.src = src;
  document.head.appendChild(el);
  el.dispatchEvent(new Event("error"));
}

beforeEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = "";
  reload = vi.fn();
  dismissSplash = vi.fn();
  beacons = [];
  (window as unknown as Record<string, unknown>).DibayBootBridge = { dismissSplash };
  delete (window as unknown as Record<string, unknown>).__dibayBootMetrics;
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: (_u: string, b: { size?: number }) => {
      beacons.push(String(b?.size ?? 0));
      return true;
    },
  });
});

afterEach(() => {
  for (const l of added) window.removeEventListener(l.type, l.fn, l.capture);
  added = [];
  delete (window as unknown as Record<string, unknown>).DibayBootBridge;
});

describe("pre-hydration guard", () => {
  it("1차 실패: 같은 빌드에서 처음이면 새로고침 1회 + 회복 계측 키 기록", () => {
    runGuard("abc1234");
    failScript();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(PRE_HYDRATION_GUARD_RELOADED_SHA_KEY)).toBe("abc1234");
    expect(sessionStorage.getItem(ENTRY_TELEMETRY_RECOVERY_KEY)).toBe("pre_hydration_chunk");
    expect(sessionStorage.getItem(ENTRY_TELEMETRY_RELOADS_KEY)).toBe("1");
    expect(dismissSplash).not.toHaveBeenCalled();
    expect(beacons).toHaveLength(1);
  });

  it("같은 빌드로 다시 실패: 새로고침하지 않고 오류 안내 + 시작 화면 해제 + 실제 새로고침 버튼", () => {
    runGuard("abc1234");
    failScript();
    for (const l of added) window.removeEventListener(l.type, l.fn, l.capture);
    added = [];
    reload.mockClear();

    runGuard("abc1234"); // 새로고침 후 같은 빌드 문서
    failScript();
    expect(reload).not.toHaveBeenCalled();
    const box = document.getElementById("dibay-boot-guard-error");
    expect(box).not.toBeNull();
    expect(box?.getAttribute("role")).toBe("alert");
    expect(dismissSplash).toHaveBeenCalledTimes(1);
    box?.querySelector("button")?.dispatchEvent(new MouseEvent("click"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("새 빌드가 배포됐으면 그 빌드로 1회 더 새로고침할 수 있다 (빌드당 1회)", () => {
    sessionStorage.setItem(PRE_HYDRATION_GUARD_RELOADED_SHA_KEY, "old0000");
    runGuard("new1111");
    failScript();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("React 마운트 후에는 아무것도 하지 않는다 (기존 처리기 담당)", () => {
    (window as unknown as Record<string, unknown>).__dibayBootMetrics = { reactMounted: 900 };
    runGuard();
    failScript();
    expect(reload).not.toHaveBeenCalled();
    expect(document.getElementById("dibay-boot-guard-error")).toBeNull();
  });

  it("앱 청크가 아닌 스크립트 실패·일반 오류는 무시한다", () => {
    runGuard();
    failScript("https://example.com/analytics.js");
    window.dispatchEvent(new ErrorEvent("error", { message: "TypeError: x is undefined" }));
    expect(reload).not.toHaveBeenCalled();
  });

  it("ChunkLoadError 거부도 감지한다", () => {
    runGuard();
    const ev = new Event("unhandledrejection") as Event & { reason?: unknown };
    const err = new Error("Failed to load chunk /_next/static/chunks/x.js");
    err.name = "ChunkLoadError";
    ev.reason = err;
    window.dispatchEvent(ev);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("세션 저장소를 못 쓰면 새로고침 대신 바로 오류 안내 (무한 새로고침 방지)", () => {
    const desc = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    try {
      runGuard();
      failScript();
    } finally {
      if (desc) Object.defineProperty(window, "sessionStorage", desc);
    }
    expect(reload).not.toHaveBeenCalled();
    expect(document.getElementById("dibay-boot-guard-error")).not.toBeNull();
  });

  it("타이머 없음 · 모듈 import 없음 · 계측 세션 키가 송신 모듈과 같다", () => {
    const script = buildPreHydrationGuardScript("abc1234");
    expect(script).not.toMatch(/setTimeout|setInterval|import\(/);
    const client = readFileSync("lib/telemetry/entry-telemetry.client.ts", "utf8");
    expect(client).toContain(`const RECOVERY_KEY = "${ENTRY_TELEMETRY_RECOVERY_KEY}";`);
    expect(client).toContain(`const RELOADS_KEY = "${ENTRY_TELEMETRY_RELOADS_KEY}";`);
  });

  it("빌드 SHA 가 없거나 이상하면 'dev' 로 고정 (주입 차단)", () => {
    expect(buildPreHydrationGuardScript('x";alert(1);//')).toContain('"sha":"dev"');
    expect(buildPreHydrationGuardScript(undefined)).toContain('"sha":"dev"');
  });

  it("루트 레이아웃 <head> 에 들어 있다", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("buildPreHydrationGuardScript(process.env.NEXT_PUBLIC_WEB_DEPLOY_SHA)");
    expect(layout).toContain("__html: PRE_HYDRATION_GUARD_SCRIPT");
  });
});
