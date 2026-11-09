/** @vitest-environment jsdom */
/**
 * D5 (Owner 승인 2026-11-09 · docs/audit/call-v4-exit-navigation-d5-plan-2026-11-09.md) —
 * 통화 종료 후 「통화 화면 나가기」는 통화 화면에 있을 때만 이동한다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMUNITY_MESSENGER_CALL_LOGS_HREF,
  exitCallV4ScreenAfterCleanup,
  isCallV4ScreenRoutePath,
  isOnCallV4ScreenRoute,
  rememberCallV4ReturnPath,
  takeCallV4ReturnPath,
} from "@/lib/community-messenger/call-v4/call-v4-route";

const RETURN_KEY = "samarket.cm.call_v4_return_path.v1";
let router: { replace: ReturnType<typeof vi.fn> };
const goTo = (p: string) => window.history.pushState({}, "", p);

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  sessionStorage.clear();
  router = { replace: vi.fn() };
  goTo("/");
});
afterEach(() => vi.restoreAllMocks());

describe("D5 통화 화면 경로 판정", () => {
  it.each([
    ["/community-messenger/calls-v4/abc", true],
    ["/community-messenger/calls-v4/abc?source=outgoing", true],
    ["/community-messenger/calls/outgoing", true],
    ["/community-messenger/calls/1234-5678", true],
    ["/community-messenger/calls/logs", false],
    ["/community-messenger/calls/logs/", false],
    ["/community-messenger", false],
    ["/community-messenger?section=call_logs", false],
    ["/", false],
    ["/mypage", false],
    ["/philife", false],
    ["/home", false],
    [null, false],
  ])("%s → %s", (path, expected) => {
    expect(isCallV4ScreenRoutePath(path)).toBe(expected);
  });
});

describe("D5 exitCallV4ScreenAfterCleanup", () => {
  it("일반 화면(/mypage)에서는 이동하지 않고, 남은 복귀 경로는 지운다", () => {
    sessionStorage.setItem(RETURN_KEY, "/philife");
    goTo("/mypage");
    exitCallV4ScreenAfterCleanup(router);
    expect(router.replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it.each(["/", "/home", "/philife", "/market", "/community-messenger", "/community-messenger/calls/logs"])(
    "%s 에서는 이동 0",
    (path) => {
      goTo(path);
      exitCallV4ScreenAfterCleanup(router);
      expect(router.replace).not.toHaveBeenCalled();
    },
  );

  it("통화 화면에서는 기존대로 복귀 경로로 이동", () => {
    goTo("/mypage");
    rememberCallV4ReturnPath();
    goTo("/community-messenger/calls-v4/c1?source=sheet");
    exitCallV4ScreenAfterCleanup(router);
    expect(router.replace).toHaveBeenCalledWith("/mypage");
  });

  it("통화 화면에서 복귀 경로가 없으면 기존대로 통화 기록", () => {
    goTo("/community-messenger/calls-v4/c1");
    exitCallV4ScreenAfterCleanup(router);
    expect(router.replace).toHaveBeenCalledWith(COMMUNITY_MESSENGER_CALL_LOGS_HREF);
  });

  it("발신 화면(/calls/outgoing)에서도 기존대로 이동", () => {
    goTo("/community-messenger/calls/outgoing");
    exitCallV4ScreenAfterCleanup(router);
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it("종료가 통화 화면에서 시작됐으면(wasOnCallScreen) 정리 중 경로가 바뀌었어도 기존대로 이동", () => {
    goTo("/mypage");
    rememberCallV4ReturnPath();
    goTo("/home"); // 정리 중 다른 화면으로 바뀐 상황
    exitCallV4ScreenAfterCleanup(router, { wasOnCallScreen: true });
    expect(router.replace).toHaveBeenCalledWith("/mypage");
  });

  it("wasOnCallScreen:false 이고 일반 화면이면 이동 0", () => {
    goTo("/home");
    exitCallV4ScreenAfterCleanup(router, { wasOnCallScreen: false });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("일반 화면에서 지운 뒤 다음 통화는 오래된 경로를 쓰지 않는다", () => {
    sessionStorage.setItem(RETURN_KEY, "/philife");
    goTo("/mypage");
    exitCallV4ScreenAfterCleanup(router);
    expect(takeCallV4ReturnPath()).toBeNull();
  });

  it("isOnCallV4ScreenRoute 는 현재 경로 기준", () => {
    goTo("/community-messenger/calls-v4/x");
    expect(isOnCallV4ScreenRoute()).toBe(true);
    goTo("/mypage");
    expect(isOnCallV4ScreenRoute()).toBe(false);
  });
});

describe("D5 종료 흐름 배선(소스 계약)", () => {
  const actions = readFileSync(join(process.cwd(), "lib/community-messenger/call-v4/call-v4-actions.ts"), "utf8");
  it("finalizeCallV4Terminal 은 정리(await cleanupCallV4) 전에 통화 화면 여부를 기록한다", () => {
    const start = actions.indexOf("async function finalizeCallV4Terminal(");
    const body = actions.slice(start, actions.indexOf("function runCallV4ScreenExitAfterTerminalCleanup(", start));
    const capture = body.indexOf("const wasOnCallScreen = isOnCallV4ScreenRoute();");
    const cleanup = body.indexOf("await cleanupCallV4(");
    expect(capture).toBeGreaterThan(-1);
    expect(cleanup).toBeGreaterThan(capture);
    expect(body).toContain("wasOutgoingPresentationRoute, wasOnCallScreen)");
  });
  it("종료 후 이탈 3곳 모두 wasOnCallScreen 을 넘긴다", () => {
    const start = actions.indexOf("function runCallV4ScreenExitAfterTerminalCleanup(");
    const body = actions.slice(start, actions.indexOf("\n}\n", start));
    expect((body.match(/exitCallV4ScreenAfterCleanup\(router, \{ wasOnCallScreen \}\)/g) ?? []).length).toBe(2);
    expect(body).toContain("maybeExitCallV4ScreenAfterCleanup(sid, reason, router, { wasOnCallScreen })");
  });
});
