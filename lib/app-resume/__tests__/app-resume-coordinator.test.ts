import { describe, expect, it, vi } from "vitest";
import {
  createAppResumeCoordinator,
  type AppResumeCoordinatorDeps,
} from "@/lib/app-resume/app-resume-coordinator";

function makeDeps(over: Partial<AppResumeCoordinatorDeps> = {}) {
  let t = 1_000;
  const order: string[] = [];
  const deps: AppResumeCoordinatorDeps = {
    now: () => t,
    waitForSessionFreshness: vi.fn(async () => {
      order.push("session");
    }),
    waitForIdle: vi.fn(async () => {
      order.push("idle");
    }),
    isOnline: () => true,
    waitForOnline: vi.fn(async () => {}),
    hasOwnLiveCall: () => false,
    ...over,
  };
  return { deps, order, advance: (ms: number) => (t += ms) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("app resume coordinator", () => {
  it("한 번의 복귀에 신호가 여러 개 와도 작업은 1회", async () => {
    const { deps, advance } = makeDeps();
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "a", lane: "auth", run });
    c.noteHidden("visibility_hidden");
    c.noteHidden("app_inactive");
    advance(10_000);
    c.noteVisible("visibility_visible");
    c.noteVisible("app_active");
    c.noteVisible("pageshow_persisted");
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0].hiddenMs).toBe(10_000);
    expect(c.getState().epoch).toBe(1);
  });

  it("앱 시작(처음부터 보임)은 복귀가 아니다", async () => {
    const { deps } = makeDeps();
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "a", lane: "auth", run });
    c.noteVisible("visibility_visible");
    await flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("minHiddenMs 미만이면 실행하지 않는다", async () => {
    const { deps, advance } = makeDeps();
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "rewarm", lane: "background", minHiddenMs: 300_000, run });
    c.noteHidden("h");
    advance(299_999);
    c.noteVisible("v");
    await flush();
    expect(run).not.toHaveBeenCalled();
    c.noteHidden("h");
    advance(300_000);
    c.noteVisible("v");
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("세션 신선도 대기 뒤에 auth, idle 뒤에 background", async () => {
    const order: string[] = [];
    const { deps, advance } = makeDeps({
      waitForSessionFreshness: async () => {
        order.push("session");
      },
      waitForIdle: async () => {
        order.push("idle");
      },
    });
    const c = createAppResumeCoordinator(deps, { visible: true });
    c.register({ id: "auth", lane: "auth", run: () => void order.push("auth") });
    c.register({ id: "bg", lane: "background", run: () => void order.push("bg") });
    c.noteHidden("h");
    advance(1);
    c.noteVisible("v");
    await flush();
    expect(order.indexOf("session")).toBeLessThan(order.indexOf("auth"));
    expect(order.indexOf("idle")).toBeLessThan(order.indexOf("bg"));
    expect(order.indexOf("session")).toBeLessThan(order.indexOf("bg"));
  });

  it("통화 중이면 background 를 건너뛰고 auth 는 실행", async () => {
    const { deps, advance } = makeDeps({ hasOwnLiveCall: () => true });
    const c = createAppResumeCoordinator(deps, { visible: true });
    const auth = vi.fn();
    const bg = vi.fn();
    c.register({ id: "auth", lane: "auth", run: auth });
    c.register({ id: "bg", lane: "background", run: bg });
    c.noteHidden("h");
    advance(1);
    c.noteVisible("v");
    await flush();
    expect(auth).toHaveBeenCalledTimes(1);
    expect(bg).not.toHaveBeenCalled();
  });

  it("복귀 도중 다시 숨겨지면 남은 작업 취소", async () => {
    let releaseSession!: () => void;
    const { deps, advance } = makeDeps({
      waitForSessionFreshness: () => new Promise<void>((r) => (releaseSession = r)),
    });
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "a", lane: "auth", run });
    c.noteHidden("h");
    advance(1);
    c.noteVisible("v");
    c.noteHidden("h2");
    releaseSession();
    await flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("로그아웃·계정 전환(abortCurrent)이면 남은 작업 취소", async () => {
    let releaseSession!: () => void;
    const { deps, advance } = makeDeps({
      waitForSessionFreshness: () => new Promise<void>((r) => (releaseSession = r)),
    });
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "a", lane: "auth", run });
    c.noteHidden("h");
    advance(1);
    c.noteVisible("v");
    c.abortCurrent("signed_out");
    releaseSession();
    await flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("오프라인이면 online 까지 미룬다", async () => {
    let online = false;
    let releaseOnline!: () => void;
    const { deps, advance } = makeDeps({
      isOnline: () => online,
      waitForOnline: () => new Promise<void>((r) => (releaseOnline = r)),
    });
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "a", lane: "auth", run });
    c.noteHidden("h");
    advance(1);
    c.noteVisible("v");
    await flush();
    expect(run).not.toHaveBeenCalled();
    online = true;
    releaseOnline();
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("작업 오류는 다른 작업을 막지 않는다", async () => {
    const errors: string[] = [];
    const { deps, advance } = makeDeps({ onTaskError: (id) => void errors.push(id) });
    const c = createAppResumeCoordinator(deps, { visible: true });
    const ok = vi.fn();
    c.register({
      id: "bad",
      lane: "auth",
      run: () => {
        throw new Error("x");
      },
    });
    c.register({ id: "ok", lane: "auth", run: ok });
    c.noteHidden("h");
    advance(1);
    c.noteVisible("v");
    await flush();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(errors).toEqual(["bad"]);
  });

  it("해제한 작업은 실행되지 않는다", async () => {
    const { deps, advance } = makeDeps();
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    const off = c.register({ id: "a", lane: "auth", run });
    off();
    c.noteHidden("h");
    advance(1);
    c.noteVisible("v");
    await flush();
    expect(run).not.toHaveBeenCalled();
  });
});
