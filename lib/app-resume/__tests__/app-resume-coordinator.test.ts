import { describe, expect, it, vi } from "vitest";
import {
  createAppResumeCoordinator,
  decideTask,
  type AppResumeCoordinatorDeps,
  type AppResumeSessionOutcome,
} from "@/lib/app-resume/app-resume-coordinator";

function makeDeps(over: Partial<AppResumeCoordinatorDeps> = {}, session: AppResumeSessionOutcome = "fresh") {
  let t = 1_000;
  const resolveSession = vi.fn(async () => session);
  const deps: AppResumeCoordinatorDeps = {
    now: () => t,
    resolveSession,
    waitForIdle: vi.fn(async () => {}),
    isOnline: () => true,
    waitForOnline: vi.fn(async () => {}),
    hasOwnLiveCall: () => false,
    ...over,
  };
  return { deps, resolveSession, advance: (ms: number) => (t += ms) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function resume(c: ReturnType<typeof createAppResumeCoordinator>, advance: (ms: number) => void, ms = 10_000) {
  c.noteHidden("h");
  advance(ms);
  c.noteVisible("v");
}

describe("decideTask — 결과 6종 × 등급 3종 (FAIL-CLOSED 표)", () => {
  const table: Record<AppResumeSessionOutcome, [string, string, string]> = {
    // [required, optional, none]
    fresh: ["run", "run", "run"],
    refreshed: ["run", "run", "run"],
    pending: ["defer", "defer", "run"],
    error: ["defer", "defer", "run"],
    invalid: ["cancel", "cancel", "run"],
    guest: ["cancel", "run", "run"],
  };
  for (const [session, [req, opt, none]] of Object.entries(table) as [AppResumeSessionOutcome, [string, string, string]][]) {
    it(session, () => {
      expect(decideTask("required", session)).toBe(req);
      expect(decideTask("optional", session)).toBe(opt);
      expect(decideTask("none", session)).toBe(none);
    });
  }
});

describe("복귀 1회화·숨김 조건 (기존 계약 유지)", () => {
  it("한 번의 복귀에 신호가 여러 개 와도 작업은 1회", async () => {
    const { deps, advance } = makeDeps();
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "a", lane: "auth", auth: "required", run });
    c.noteHidden("visibility_hidden");
    c.noteHidden("app_inactive");
    advance(10_000);
    c.noteVisible("visibility_visible");
    c.noteVisible("app_active");
    c.noteVisible("pageshow_persisted");
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0].hiddenMs).toBe(10_000);
  });
  it("앱 시작은 복귀가 아니다", async () => {
    const { deps } = makeDeps();
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "a", lane: "auth", auth: "none", run });
    c.noteVisible("v");
    await flush();
    expect(run).not.toHaveBeenCalled();
  });
  it("minHiddenMs 미만이면 실행 안 함", async () => {
    const { deps, advance } = makeDeps();
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "r", lane: "background", auth: "optional", minHiddenMs: 300_000, run });
    resume(c, advance, 299_999);
    await flush();
    expect(run).not.toHaveBeenCalled();
    resume(c, advance, 300_000);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("통화 중이면 background 생략", async () => {
    const { deps, advance } = makeDeps({ hasOwnLiveCall: () => true });
    const c = createAppResumeCoordinator(deps, { visible: true });
    const bg = vi.fn();
    const fg = vi.fn();
    c.register({ id: "bg", lane: "background", auth: "none", run: bg });
    c.register({ id: "fg", lane: "auth", auth: "none", run: fg });
    resume(c, advance);
    await flush();
    expect(fg).toHaveBeenCalledTimes(1);
    expect(bg).not.toHaveBeenCalled();
  });
});

describe("인증 FAIL-CLOSED", () => {
  it("공개 작업은 세션 판정 없이 실행(인증과 분리)", async () => {
    const { deps, advance, resolveSession } = makeDeps({}, "pending");
    const c = createAppResumeCoordinator(deps, { visible: true });
    const pub = vi.fn();
    c.register({ id: "pub", lane: "auth", auth: "none", run: pub });
    resume(c, advance);
    await flush();
    expect(pub).toHaveBeenCalledTimes(1);
    expect(resolveSession).not.toHaveBeenCalled();
  });

  it("pending: 인증 필수 작업은 실행하지 않고 보류 → 세션 이벤트 1회에 재판정 후 실행", async () => {
    let outcome: AppResumeSessionOutcome = "pending";
    const { deps, advance } = makeDeps({ resolveSession: vi.fn(async () => outcome) });
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "req", lane: "auth", auth: "required", run });
    resume(c, advance);
    await flush();
    expect(run).not.toHaveBeenCalled();
    expect(c.getState().deferred).toBe(1);
    outcome = "refreshed";
    c.noteSessionEvent("refreshed");
    c.noteSessionEvent("refreshed"); // 중복 이벤트
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0].session).toBe("refreshed");
  });

  it("보류 재판정에서도 미확정이면 폐기 — 무한 재시도 없음", async () => {
    const resolveSession = vi.fn(async () => "pending" as AppResumeSessionOutcome);
    const { deps, advance } = makeDeps({ resolveSession });
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "req", lane: "auth", auth: "required", run });
    resume(c, advance);
    await flush();
    c.noteSessionEvent("refreshed");
    await flush();
    c.noteSessionEvent("refreshed");
    c.noteSessionEvent("signed_in");
    await flush();
    expect(run).not.toHaveBeenCalled();
    expect(resolveSession).toHaveBeenCalledTimes(2); // 복귀 1 + 이벤트 1
    expect(c.getState().deferred).toBe(0);
  });

  it("invalid: 인증 필수·선택 모두 취소, 이후 이벤트에도 실행 안 함", async () => {
    const { deps, advance } = makeDeps({}, "invalid");
    const c = createAppResumeCoordinator(deps, { visible: true });
    const req = vi.fn();
    const opt = vi.fn();
    c.register({ id: "req", lane: "auth", auth: "required", run: req });
    c.register({ id: "opt", lane: "background", auth: "optional", run: opt });
    resume(c, advance);
    await flush();
    c.noteSessionEvent("signed_in");
    await flush();
    expect(req).not.toHaveBeenCalled();
    expect(opt).not.toHaveBeenCalled();
  });

  it("guest: 필수 취소, 선택(공개 탭 프리페치 등)은 실행", async () => {
    const { deps, advance } = makeDeps({}, "guest");
    const c = createAppResumeCoordinator(deps, { visible: true });
    const req = vi.fn();
    const opt = vi.fn();
    c.register({ id: "req", lane: "auth", auth: "required", run: req });
    c.register({ id: "opt", lane: "background", auth: "optional", run: opt });
    resume(c, advance);
    await flush();
    expect(req).not.toHaveBeenCalled();
    expect(opt).toHaveBeenCalledTimes(1);
  });

  it("세션 변경(abort) 시 보류 작업 폐기 — 이후 이벤트에도 실행 안 함", async () => {
    let outcome: AppResumeSessionOutcome = "pending";
    const { deps, advance } = makeDeps({ resolveSession: vi.fn(async () => outcome) });
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "req", lane: "auth", auth: "required", run });
    resume(c, advance);
    await flush();
    c.abortCurrent("account_changed");
    outcome = "fresh";
    c.noteSessionEvent("signed_in");
    await flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("판정 중 다시 숨겨지면 아무것도 실행 안 함", async () => {
    let release!: (o: AppResumeSessionOutcome) => void;
    const { deps, advance } = makeDeps({
      resolveSession: () => new Promise<AppResumeSessionOutcome>((r) => (release = r)),
    });
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "req", lane: "auth", auth: "required", run });
    resume(c, advance);
    c.noteHidden("h2");
    release("fresh");
    await flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("같은 epoch·같은 작업 ID 는 1회 — 다음 복귀에서는 다시 실행", async () => {
    const { deps, advance } = makeDeps({}, "fresh");
    const c = createAppResumeCoordinator(deps, { visible: true });
    const run = vi.fn();
    c.register({ id: "req", lane: "auth", auth: "required", run });
    resume(c, advance);
    await flush();
    c.noteSessionEvent("refreshed");
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    resume(c, advance);
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("오프라인이면 online 까지 대기, 작업 오류는 다른 작업을 막지 않음", async () => {
    let online = false;
    let releaseOnline!: () => void;
    const errors: string[] = [];
    const { deps, advance } = makeDeps({
      isOnline: () => online,
      waitForOnline: () => new Promise<void>((r) => (releaseOnline = r)),
      onTaskError: (id) => void errors.push(id),
    });
    const c = createAppResumeCoordinator(deps, { visible: true });
    const ok = vi.fn();
    c.register({ id: "bad", lane: "auth", auth: "required", run: () => { throw new Error("x"); } });
    c.register({ id: "ok", lane: "auth", auth: "required", run: ok });
    resume(c, advance);
    await flush();
    expect(ok).not.toHaveBeenCalled();
    online = true;
    releaseOnline();
    await flush();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(errors).toEqual(["bad"]);
  });
});
