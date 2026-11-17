// @vitest-environment jsdom
/**
 * 진입 감사 5단계 (2026-11-17) — 인트로 소재 묶음 · 네이티브 인트로 연결.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cap = vi.hoisted(() => ({
  native: true,
  available: true,
  listener: null as null | ((e: Record<string, unknown>) => void),
  sync: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => cap.native,
    isPluginAvailable: () => cap.available,
    getPlatform: () => "android",
  },
  registerPlugin: () => ({
    sync: cap.sync,
    addListener: async (_: string, fn: (e: Record<string, unknown>) => void) => {
      cap.listener = fn;
      return { remove: async () => {} };
    },
  }),
}));

import {
  DEFAULT_LAUNCH_INTRO_POOL_POLICY,
  normalizeLaunchIntroPoolPolicy,
  selectLiveLaunchIntroPoolRows,
  validateLaunchIntroPoolInput,
  validateLaunchIntroPoolPolicy,
} from "@/lib/launch-intro/pool";
import {
  __resetNativeIntroClientForTests,
  isNativeIntroActive,
  readNativeIntroLaunchId,
  startNativeIntroBridge,
  syncNativeIntroPool,
} from "@/lib/launch-intro/native-intro-client";
import { readLaunchIntroOverlayActive } from "@/lib/platform-popup/popup-launch-intro-gate";

const ID = "11111111-2222-4333-8444-555555555555";

describe("소재 입력 검사", () => {
  it("새 소재는 이름 필수 · 정상 값은 열 이름으로", () => {
    expect(validateLaunchIntroPoolInput({}, { partial: false })).toEqual({ ok: false, error: "name_invalid" });
    expect(
      validateLaunchIntroPoolInput(
        { name: " 봄 할인 ", backgroundColor: "#0b421a", durationMs: 2000, ctaHref: "/stores", showAdLabel: true },
        { partial: false }
      )
    ).toEqual({
      ok: true,
      row: { name: "봄 할인", background_color: "#0B421A", duration_ms: 2000, cta_href: "/stores", show_ad_label: true },
    });
  });

  it("모르는 값은 거절(조용히 바꾸지 않음)", () => {
    const p = { partial: true };
    expect(validateLaunchIntroPoolInput({ durationMs: 6000 }, p)).toEqual({ ok: false, error: "duration_invalid" });
    expect(validateLaunchIntroPoolInput({ durationMs: 900 }, p)).toEqual({ ok: false, error: "duration_invalid" });
    expect(validateLaunchIntroPoolInput({ status: "live" }, p)).toEqual({ ok: false, error: "status_invalid" });
    expect(validateLaunchIntroPoolInput({ backgroundColor: "green" }, p)).toEqual({ ok: false, error: "background_invalid" });
    expect(validateLaunchIntroPoolInput({ ctaHref: "javascript:alert(1)" }, p)).toEqual({ ok: false, error: "cta_invalid" });
    expect(validateLaunchIntroPoolInput({ ctaHref: "http://x.com" }, p)).toEqual({ ok: false, error: "cta_invalid" });
    expect(
      validateLaunchIntroPoolInput({ startAt: "2026-11-20T00:00:00Z", endAt: "2026-11-19T00:00:00Z" }, p)
    ).toEqual({ ok: false, error: "window_invalid" });
  });

  it("목적지 비우기 = 없음", () => {
    expect(validateLaunchIntroPoolInput({ ctaHref: "" }, { partial: true })).toEqual({ ok: true, row: { cta_href: null } });
  });
});

describe("전체 설정", () => {
  it("기본 = 켜짐 · OS 종료 후 실행에도 보이기(설계 OS-3)", () => {
    expect(normalizeLaunchIntroPoolPolicy(null)).toEqual(DEFAULT_LAUNCH_INTRO_POOL_POLICY);
    expect(DEFAULT_LAUNCH_INTRO_POOL_POLICY).toEqual({ enabled: true, showOnOsRestore: true });
    expect(validateLaunchIntroPoolPolicy({ enabled: true })).toEqual({ ok: false, error: "policy_invalid" });
  });
});

describe("앱에 보낼 소재", () => {
  const row = (id: string, extra: Record<string, unknown>) =>
    ({ id, status: "active", start_at: null, end_at: null, sort_order: 0, ...extra }) as {
      id: string;
      status: string;
      start_at: string | null;
      end_at: string | null;
      sort_order: number;
    };
  it("켜진 것만 · 끝난 기간 제외 · 시작 전은 미리 보냄(기기가 기간 판단) · 순서대로", () => {
    const now = new Date("2026-11-17T00:00:00Z");
    const out = selectLiveLaunchIntroPoolRows(
      [
        row("c", { sort_order: 2 }),
        row("a", { sort_order: 1 }),
        row("off", { status: "paused" }),
        row("old", { end_at: "2026-11-16T00:00:00Z" }),
        row("soon", { start_at: "2026-11-18T00:00:00Z", sort_order: 3 }),
      ],
      now
    );
    expect(out.map((r) => r.id)).toEqual(["a", "c", "soon"]);
  });
});

describe("네이티브 인트로 연결", () => {
  beforeEach(() => {
    __resetNativeIntroClientForTests();
    cap.native = true;
    cap.available = true;
    cap.listener = null;
    cap.sync.mockClear();
    window.localStorage.clear();
    delete (window as { __DIBAY_NATIVE_INTRO__?: string }).__DIBAY_NATIVE_INTRO__;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("네이티브 인트로가 떠 있는 실행: 팝업 보류 → done 신호 뒤 풀림 · 기록 전송 · 누름은 목적지 열기", async () => {
    Object.defineProperty(window, "__DIBAY_NATIVE_INTRO__", { value: ID, configurable: true });
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const open = vi.fn();
    expect(readNativeIntroLaunchId()).toBe(ID);
    startNativeIntroBridge(open);
    await Promise.resolve();
    expect(isNativeIntroActive()).toBe(true);
    expect(readLaunchIntroOverlayActive()).toBe(true);
    cap.listener!({ type: "impression", creativeId: ID, exposureId: "e-123456789" });
    cap.listener!({ type: "click", creativeId: ID, exposureId: "e-123456789", href: "/stores" });
    cap.listener!({ type: "done", creativeId: ID, exposureId: "e-123456789" });
    expect(open).toHaveBeenCalledWith("/stores");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ creativeId: ID, eventType: "click", renderer: "native", href: "/stores" });
    expect(isNativeIntroActive()).toBe(false);
    expect(readLaunchIntroOverlayActive()).toBe(false);
  });

  it("네이티브 인트로 없는 실행 = 보류 없음", () => {
    startNativeIntroBridge(vi.fn());
    expect(isNativeIntroActive()).toBe(false);
  });

  it("묶음 맞추기: 같은 판이면 다시 안 함 · 서버 읽기 실패(null)면 그대로 · 플러그인 없는 앱은 안 함", async () => {
    const pool = { enabled: true, showOnOsRestore: true, revision: "r1", entries: [] };
    await syncNativeIntroPool(pool);
    await syncNativeIntroPool(pool);
    expect(cap.sync).toHaveBeenCalledTimes(1);
    await syncNativeIntroPool(null);
    expect(cap.sync).toHaveBeenCalledTimes(1);
    cap.available = false;
    await syncNativeIntroPool({ ...pool, revision: "r2" });
    expect(cap.sync).toHaveBeenCalledTimes(1);
  });
});
