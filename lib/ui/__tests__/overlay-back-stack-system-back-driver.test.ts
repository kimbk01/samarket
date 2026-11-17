import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * S1 (docs/audit/android-system-nav-2026-11-17/s1-s3-design.md) — 기본 driver:
 * 새 설치본(DibaySystemBack 있음)은 리스너를 붙인 동안만 setActive(true), 떼면 setActive(false).
 * 구 설치본(플러그인 없음)은 지금처럼 App.addListener("backButton").
 */

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
};

/** 실제 Capacitor 플러그인 프록시처럼 모든 속성(then 포함)에 함수를 돌려준다 — thenable 함정 재현. */
function asCapacitorProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return (t as Record<PropertyKey, unknown>)[prop];
      return () => new Promise(() => {});
    },
  });
}

async function setup(systemBackAvailable: boolean) {
  const sysRemove = vi.fn();
  const sys = {
    addListener: vi.fn(async () => ({ remove: sysRemove })),
    setActive: vi.fn(async () => {}),
  };
  const appRemove = vi.fn();
  const app = { addListener: vi.fn(async () => ({ remove: appRemove })) };
  vi.doMock("@/lib/platform/capacitor-native", () => ({ resolveCapacitorShellPlatform: () => "android" }));
  vi.doMock("@/lib/launch-intro/native-intro-client", () => ({ isNativeIntroActive: () => false }));
  vi.doMock("@capacitor/core", () => ({
    Capacitor: { isPluginAvailable: (name: string) => systemBackAvailable && name === "DibaySystemBack" },
    registerPlugin: () => asCapacitorProxy(sys),
  }));
  vi.doMock("@capacitor/app", () => ({ App: asCapacitorProxy(app) }));
  // 모의 모듈을 미리 불러 둔다 — 시험 대상의 동적 import 가 캐시에서 바로 끝나 CI 부하와 무관해진다
  // (2026-11-18 main CI test(2/2) 에서 「구 설치본」 경우가 첫 불러오기 지연으로 실패).
  await import("@capacitor/core");
  await import("@capacitor/app");
  return { sys, sysRemove, app, appRemove };
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/platform/capacitor-native");
  vi.doUnmock("@/lib/launch-intro/native-intro-client");
  vi.doUnmock("@capacitor/core");
  vi.doUnmock("@capacitor/app");
});

describe("overlay-back-stack 기본 driver (S1)", () => {
  it("새 설치본: 창이 열린 동안만 DibaySystemBack 에 ◁ 받기를 켠다", async () => {
    const m = await setup(true);
    const stack = await import("@/lib/ui/overlay-back-stack");
    const release = stack.pushOverlayBackEntry(() => {});
    await flush();
    expect(m.sys.addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
    expect(m.sys.setActive).toHaveBeenLastCalledWith({ active: true });
    expect(m.app.addListener).not.toHaveBeenCalled();

    release();
    await flush();
    expect(m.sysRemove).toHaveBeenCalledTimes(1);
    expect(m.sys.setActive).toHaveBeenLastCalledWith({ active: false });
  });

  it("창이 없으면 리스너도 받기 신호도 없다", async () => {
    const m = await setup(true);
    await import("@/lib/ui/overlay-back-stack");
    await flush();
    expect(m.sys.addListener).not.toHaveBeenCalled();
    expect(m.sys.setActive).not.toHaveBeenCalled();
  });

  it("구 설치본(플러그인 없음): 지금처럼 App backButton 을 쓴다", async () => {
    const m = await setup(false);
    const stack = await import("@/lib/ui/overlay-back-stack");
    const release = stack.pushOverlayBackEntry(() => {});
    await flush();
    expect(m.app.addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
    expect(m.sys.addListener).not.toHaveBeenCalled();
    release();
    await flush();
    expect(m.appRemove).toHaveBeenCalledTimes(1);
  });

  it("붙기 전에 닫히면 리스너를 바로 떼고 받기를 켜지 않는다", async () => {
    const m = await setup(true);
    const stack = await import("@/lib/ui/overlay-back-stack");
    const release = stack.pushOverlayBackEntry(() => {});
    release();
    await flush();
    expect(m.sysRemove).toHaveBeenCalledTimes(1);
    expect(m.sys.setActive).not.toHaveBeenCalled();
  });

  it("P5 페이지 뒤로 주인: 등록 동안만 받기를 켜고 해제하면 끈다(리스너 1개)", async () => {
    const m = await setup(true);
    const stack = await import("@/lib/ui/overlay-back-stack");
    const release = stack.setPageBackOwner(() => {});
    await flush();
    expect(m.sys.addListener).toHaveBeenCalledTimes(1);
    expect(m.sys.setActive).toHaveBeenLastCalledWith({ active: true });
    release();
    await flush();
    expect(m.sysRemove).toHaveBeenCalledTimes(1);
    expect(m.sys.setActive).toHaveBeenLastCalledWith({ active: false });
  });
});
