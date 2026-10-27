import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * FR-D2 (10-27 Samsung 실기기): 거절된 상대에게 다시 요청 → 서버 400 request_rejected,
 * 스낵바 「…다시 요청할 수 없습니다」 는 DOM 에 있었으나 하단 탭에 가려 안 보였다
 * (위치 = 화면 맨 아래, 호스트가 `.main-hub-scroll-body` z-index 0 쌓임 맥락 안).
 */
describe("FR-D2 메신저 스낵바는 하단 탭 위·body 레이어", () => {
  const src = readFileSync("components/community-messenger/MessengerSnackbarHost.tsx", "utf8");

  it("공통 토스트 위치(.dibay-toast-stack — 하단 탭 위)를 쓴다", () => {
    expect(src).toContain("dibay-toast-stack");
    expect(src).not.toContain("bottom-[max(10px,var(--safe-bottom))]");
  });

  it("body 로 포털해 화면 쌓임 맥락에 갇히지 않는다", () => {
    expect(src).toContain("createPortal(node, document.body)");
  });

  it("공통 토스트 위치 규칙이 하단 탭 높이를 반영한다", () => {
    const css = readFileSync("app/dibay-overlay.css", "utf8");
    expect(css).toMatch(/\.dibay-toast-stack \{\s*bottom: calc\(\s*var\(--app-bottom-nav-height/);
  });
});
