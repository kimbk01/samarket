/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import {
  exitCallV4ScreenAfterCleanup,
  isOnCallV4ScreenRoute,
  rememberCallV4ReturnPath,
} from "@/lib/community-messenger/call-v4/call-v4-route";

describe("C-16 / R1 — 통화 화면 라우트가 아니면 웹 이동 0회", () => {
  it("route matcher", () => {
    expect(isOnCallV4ScreenRoute("/community-messenger/calls-v4/abc")).toBe(true);
    expect(isOnCallV4ScreenRoute("/community-messenger/calls/logs")).toBe(false);
    expect(isOnCallV4ScreenRoute("/community-messenger/rooms/r1")).toBe(false);
  });
  it("채팅방 위에서(네이티브 소유 통화 종료) → replace/push 호출 없음, 복귀 주소는 소비", () => {
    window.history.replaceState({}, "", "/community-messenger/rooms/r1");
    const router = { replace: vi.fn(), push: vi.fn() };
    rememberCallV4ReturnPath();
    exitCallV4ScreenAfterCleanup(router);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
  it("웹 통화 화면 위에서는 기존처럼 복귀 주소로 이동", () => {
    window.history.replaceState({}, "", "/community-messenger/rooms/r1");
    rememberCallV4ReturnPath();
    window.history.replaceState({}, "", "/community-messenger/calls-v4/c1?source=outgoing");
    const router = { replace: vi.fn(), push: vi.fn() };
    exitCallV4ScreenAfterCleanup(router);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/r1");
  });
});
