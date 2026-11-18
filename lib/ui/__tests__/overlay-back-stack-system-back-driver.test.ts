import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * S1 (docs/audit/android-system-nav-2026-11-17/s1-s3-design.md) — 기본 driver:
 * 새 설치본(DibaySystemBack 있음)은 리스너를 붙인 동안만 setActive(true), 떼면 setActive(false).
 * 구 설치본(플러그인 없음)은 지금처럼 App.addListener("backButton").
 */

/** 「아무 일도 없어야 함」을 볼 때만 쓰는 짧은 대기 — 일어나야 하는 일은 `vi.waitFor` 로 끝날 때까지 기다린다. */
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
};

/**
 * 범위 밖 E4 (2026-11-18 감사) — 시험 대상은 `@capacitor/core`·`@capacitor/app` 를 동적 import 로 불러 리스너를 단다.
 * 고정 5틱(`flush`)만 기다리면 부하가 클 때(load avg 50~69) import 가 더 늦어 2건 실패했다 → 설치 완료까지 기다린다.
 */
const until = (check: () => void) => vi.waitFor(check, { timeout: 5_000, interval: 5 });

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
    await until(() => expect(m.sys.setActive).toHaveBeenLastCalledWith({ active: true }));
    expect(m.sys.addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
    expect(m.app.addListener).not.toHaveBeenCalled();

    release();
    await until(() => expect(m.sys.setActive).toHaveBeenLastCalledWith({ active: false }));
    expect(m.sysRemove).toHaveBeenCalledTimes(1);
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
    await until(() => expect(m.app.addListener).toHaveBeenCalledWith("backButton", expect.any(Function)));
    expect(m.sys.addListener).not.toHaveBeenCalled();
    release();
    await until(() => expect(m.appRemove).toHaveBeenCalledTimes(1));
  });

  it("붙기 전에 닫히면 리스너를 바로 떼고 받기를 켜지 않는다", async () => {
    const m = await setup(true);
    const stack = await import("@/lib/ui/overlay-back-stack");
    const release = stack.pushOverlayBackEntry(() => {});
    release();
    await until(() => expect(m.sysRemove).toHaveBeenCalledTimes(1));
    await flush();
    expect(m.sys.setActive).not.toHaveBeenCalled();
  });

  it("P5 페이지 뒤로 주인: 등록 동안만 받기를 켜고 해제하면 끈다(리스너 1개)", async () => {
    const m = await setup(true);
    const stack = await import("@/lib/ui/overlay-back-stack");
    const release = stack.setPageBackOwner(() => {});
    await until(() => expect(m.sys.setActive).toHaveBeenLastCalledWith({ active: true }));
    expect(m.sys.addListener).toHaveBeenCalledTimes(1);
    release();
    await until(() => expect(m.sys.setActive).toHaveBeenLastCalledWith({ active: false }));
    expect(m.sysRemove).toHaveBeenCalledTimes(1);
  });
});
