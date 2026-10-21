/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  armCallScreenPushEntryOnMount,
  CALL_PUSH_ENTRY_PENDING_TTL_MS,
  markCallScreenPushEntry,
  readCallIdFromCallScreenPath,
  releaseCallScreenPushEntryIfLeft,
  resetCallReturnNavigationForTests,
  takeArmedCallScreenPushEntry,
} from "@/lib/community-messenger/call-v4/call-return-navigation";
import {
  exitCallV4ScreenAfterCleanup,
  registerCallV4ExitRouter,
  rememberCallV4ReturnPath,
} from "@/lib/community-messenger/call-v4/call-v4-route";

function go(path: string) {
  window.history.replaceState({}, "", path);
}

function makeRouter() {
  return { replace: vi.fn(), push: vi.fn(), back: vi.fn() };
}

describe("P-7 / L-3 — 통화 화면 push 진입 토큰", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    resetCallReturnNavigationForTests();
    registerCallV4ExitRouter(null);
    try {
      window.sessionStorage.clear();
    } catch {
      /* noop */
    }
  });
  afterEach(() => {
    registerCallV4ExitRouter(null);
    vi.restoreAllMocks();
  });

  it("통화 화면 경로에서 callId 를 읽는다(logs·outgoing 제외)", () => {
    expect(readCallIdFromCallScreenPath("/community-messenger/calls-v4/c1?source=sheet")).toBe("c1");
    expect(readCallIdFromCallScreenPath("/community-messenger/calls/c2?incomingPreview=1")).toBe("c2");
    expect(readCallIdFromCallScreenPath("/community-messenger/calls/logs")).toBeNull();
    expect(readCallIdFromCallScreenPath("/community-messenger/calls/outgoing?kind=voice")).toBeNull();
    expect(readCallIdFromCallScreenPath("/community-messenger/rooms/r1")).toBeNull();
  });

  it("T1 방 → push(레거시 /calls/<id>) → V4 마운트 → 종료: back 1회만, replace·push 0회", () => {
    go("/community-messenger/rooms/r1");
    rememberCallV4ReturnPath();
    markCallScreenPushEntry("c1", "/community-messenger/calls/c1?action=accept");
    /** 레거시 페이지가 같은 엔트리를 calls-v4 로 replace */
    go("/community-messenger/calls-v4/c1?action=accept");
    expect(armCallScreenPushEntryOnMount("c1")).toBe(true);
    const router = makeRouter();
    exitCallV4ScreenAfterCleanup(router);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("T2 back 직후 같은 화면에서 exit 가 한 번 더 와도 이동을 덧붙이지 않는다", () => {
    go("/community-messenger/rooms/r1");
    markCallScreenPushEntry("c1", "/community-messenger/calls/c1");
    go("/community-messenger/calls-v4/c1");
    armCallScreenPushEntryOnMount("c1");
    const router = makeRouter();
    exitCallV4ScreenAfterCleanup(router);
    exitCallV4ScreenAfterCleanup(router);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("T3 토큰 없음(replace 진입) → 기존 replace(복귀 주소)", () => {
    go("/community-messenger/rooms/r1");
    rememberCallV4ReturnPath();
    go("/community-messenger/calls-v4/c1?source=outgoing");
    const router = makeRouter();
    exitCallV4ScreenAfterCleanup(router);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/r1");
  });

  it("T4 다른 callId 토큰(tmp→real 교체 등) → replace", () => {
    go("/community-messenger/rooms/r1");
    markCallScreenPushEntry("c-old", "/community-messenger/calls/c-old");
    go("/community-messenger/calls-v4/c-new");
    expect(armCallScreenPushEntryOnMount("c-new")).toBe(false);
    const router = makeRouter();
    exitCallV4ScreenAfterCleanup(router);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it("T5 push 후 마운트가 너무 늦으면(대기 TTL 초과) arm 하지 않는다", () => {
    go("/community-messenger/rooms/r1");
    markCallScreenPushEntry("c1", "/community-messenger/calls/c1");
    go("/community-messenger/calls-v4/c1");
    expect(armCallScreenPushEntryOnMount("c1", Date.now() + CALL_PUSH_ENTRY_PENDING_TTL_MS + 1)).toBe(false);
    expect(takeArmedCallScreenPushEntry("c1")).toBeNull();
  });

  it("T6 통화 중 뒤로(최소화)로 화면을 떠나면 armed 해제 → 이후 replace 재진입 화면 종료는 replace", () => {
    go("/community-messenger/rooms/r1");
    markCallScreenPushEntry("c1", "/community-messenger/calls/c1");
    go("/community-messenger/calls-v4/c1");
    armCallScreenPushEntryOnMount("c1");
    go("/community-messenger/rooms/r1");
    releaseCallScreenPushEntryIfLeft("c1");
    go("/community-messenger/calls-v4/c1");
    armCallScreenPushEntryOnMount("c1");
    const router = makeRouter();
    exitCallV4ScreenAfterCleanup(router);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it("T7 StrictMode 재마운트처럼 같은 통화 화면 위면 armed 유지", () => {
    go("/community-messenger/rooms/r1");
    markCallScreenPushEntry("c1", "/community-messenger/calls/c1");
    go("/community-messenger/calls-v4/c1");
    armCallScreenPushEntryOnMount("c1");
    releaseCallScreenPushEntryIfLeft("c1");
    expect(armCallScreenPushEntryOnMount("c1")).toBe(true);
  });

  it("T8 R6 — 끝난 통화 화면에 앞으로 가기로 다시 오면 토큰이 소비돼 replace", () => {
    go("/community-messenger/rooms/r1");
    markCallScreenPushEntry("c1", "/community-messenger/calls/c1");
    go("/community-messenger/calls-v4/c1");
    armCallScreenPushEntryOnMount("c1");
    exitCallV4ScreenAfterCleanup(makeRouter());
    go("/community-messenger/rooms/r1");
    go("/community-messenger/calls-v4/c1");
    armCallScreenPushEntryOnMount("c1");
    const router = makeRouter();
    exitCallV4ScreenAfterCleanup(router);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it("T9 자동 수락 쿼리(callAction=) 화면에서 들어온 경우는 토큰을 남기지 않는다", () => {
    go("/community-messenger/rooms/r1?callAction=accept&sessionId=c1");
    markCallScreenPushEntry("c1", "/community-messenger/calls/c1");
    go("/community-messenger/calls-v4/c1");
    expect(armCallScreenPushEntryOnMount("c1")).toBe(false);
  });

  it("T10 통화 화면 위에서 다시 push 하면 origin 이 통화 화면이라 토큰을 남기지 않는다", () => {
    go("/community-messenger/calls-v4/c0");
    markCallScreenPushEntry("c1", "/community-messenger/calls/c1");
    go("/community-messenger/calls-v4/c1");
    expect(armCallScreenPushEntryOnMount("c1")).toBe(false);
  });

  it("T11 router 인자에 back 이 없으면 등록된 통화 화면 router 의 back 을 쓴다", () => {
    go("/community-messenger/rooms/r1");
    markCallScreenPushEntry("c1", "/community-messenger/calls/c1");
    go("/community-messenger/calls-v4/c1");
    armCallScreenPushEntryOnMount("c1");
    const registered = makeRouter();
    registerCallV4ExitRouter(registered);
    const partial = { replace: vi.fn() };
    exitCallV4ScreenAfterCleanup(partial);
    expect(registered.back).toHaveBeenCalledTimes(1);
    expect(partial.replace).not.toHaveBeenCalled();
  });

  it("T12 R1 유지 — 통화 라우트가 아니면 이동 0회 + 토큰 정리", () => {
    go("/community-messenger/rooms/r1");
    markCallScreenPushEntry("c1", "/community-messenger/calls/c1");
    const router = makeRouter();
    exitCallV4ScreenAfterCleanup(router);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    go("/community-messenger/calls-v4/c1");
    expect(armCallScreenPushEntryOnMount("c1")).toBe(false);
  });

  it("T13 웹 푸시 경로처럼 callId 없이 href 만으로도 토큰을 남긴다", () => {
    go("/");
    markCallScreenPushEntry(null, "/community-messenger/calls-v4/c9?source=push");
    go("/community-messenger/calls-v4/c9?source=push");
    expect(armCallScreenPushEntryOnMount("c9")).toBe(true);
    expect(takeArmedCallScreenPushEntry("c9")?.originPath).toBe("/");
  });
});
