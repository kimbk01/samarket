// @vitest-environment jsdom
/**
 * 2026-11-28 — 앱 숨김·보임 시계(옮김 + 보임 알림·지금 숨김 여부).
 * 숨김 = 문서 hidden 또는 네이티브 비활성 뒤 활성 전 · 보임 = 웹·네이티브 신호 중 먼저 오는 것.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetAppVisibilityForTests,
  __simulateAppVisibilityForTests,
  appHiddenNow,
  ensureResumeVisibilityClock,
  hiddenSpanFrom,
  onAppBecameVisible,
} from "@/lib/community-messenger/realtime/messenger-app-visibility";
import * as gate from "@/lib/community-messenger/realtime/resume-resync-gate";

function setDocHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
}

afterEach(() => {
  __resetAppVisibilityForTests();
  setDocHidden(false);
});

describe("앱 숨김·보임 시계", () => {
  it("문서 hidden 이면 숨김", () => {
    setDocHidden(true);
    expect(appHiddenNow()).toBe(true);
    setDocHidden(false);
    expect(appHiddenNow()).toBe(false);
  });

  it("네이티브 비활성이면 문서가 visible 이어도 숨김, 활성 신호로 풀리고 보임 알림", () => {
    let visible = 0;
    const off = onAppBecameVisible(() => (visible += 1));
    __simulateAppVisibilityForTests("native_inactive");
    expect(appHiddenNow()).toBe(true);
    __simulateAppVisibilityForTests("native_active");
    expect(appHiddenNow()).toBe(false);
    expect(visible).toBe(1);
    off();
    __simulateAppVisibilityForTests("doc_visible");
    expect(visible).toBe(1);
  });

  it("문서 visibilitychange visible 이면 보임 알림", () => {
    ensureResumeVisibilityClock();
    let visible = 0;
    onAppBecameVisible(() => (visible += 1));
    setDocHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(visible).toBe(0);
    setDocHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(visible).toBe(1);
  });

  it("네이티브 활성 신호를 놓쳐도 문서가 visible 이면 숨김이 풀린다", () => {
    ensureResumeVisibilityClock();
    __simulateAppVisibilityForTests("native_inactive");
    expect(appHiddenNow()).toBe(true);
    setDocHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(appHiddenNow()).toBe(false);
  });

  it("예전 이름으로도 쓴다(resume-resync-gate 다시 내보내기)", () => {
    expect(gate.hiddenSpanFrom).toBe(hiddenSpanFrom);
    expect(typeof gate.ensureResumeVisibilityClock).toBe("function");
    expect(typeof gate.lastHiddenSpanMs).toBe("function");
    expect(gate.RESUME_SIGNAL_WINDOW_MS).toBe(5_000);
  });
});
