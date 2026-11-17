/**
 * P5 §B5-2 (첫 탭 무시 X2) — 길게 누름 뒤 다음 정상 탭이 이동 없이 버려지지 않는다.
 * 훅은 React 상태 없이 ref·callback 만 쓰므로 최소 React 대역으로 직접 호출한다.
 */
import { readFileSync } from "node:fs";
import type { PointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useRef: <T,>(v: T) => ({ current: v }),
  useCallback: <T,>(fn: T) => fn,
  useEffect: () => {},
}));

import { useMessengerLongPress } from "@/lib/community-messenger/use-messenger-long-press";

const ev = (x = 0, y = 0) => ({ isPrimary: true, pointerId: 1, clientX: x, clientY: y }) as unknown as PointerEvent<Element>;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("길게 누름 → 다음 탭", () => {
  it("길게 누름 뒤 억제 표시를 소비하지 않고 끝나도, 다음 누름이 표시를 지워 탭이 통과한다", () => {
    const onLong = vi.fn();
    const lp = useMessengerLongPress(onLong, { thresholdMs: 480 });
    lp.bind.onPointerDown(ev());
    vi.advanceTimersByTime(500);
    expect(onLong).toHaveBeenCalledTimes(1);
    lp.bind.onPointerUp(ev()); // 예전 행 경로: 여기서 consumeClickSuppression 을 부르지 않음

    lp.bind.onPointerDown(ev()); // 다음 정상 탭
    lp.bind.onPointerUp(ev());
    expect(lp.consumeClickSuppression()).toBe(false);
  });

  it("같은 누름의 길게 누름 직후 클릭은 여전히 억제된다", () => {
    const lp = useMessengerLongPress(() => {}, { thresholdMs: 480 });
    lp.bind.onPointerDown(ev());
    vi.advanceTimersByTime(500);
    lp.bind.onPointerUp(ev());
    expect(lp.consumeClickSuppression()).toBe(true);
    expect(lp.consumeClickSuppression()).toBe(false);
  });
});

describe("행 계약 (MessengerChatListItem)", () => {
  const src = readFileSync("components/community-messenger/MessengerChatListItem.tsx", "utf8");
  it("손을 뗄 때 억제 표시를 단락 평가 없이 소비", () => {
    expect(src).not.toMatch(/longPressTriggeredRef\.current \|\| consumeClickSuppression\(\)\) \{\s*releasePressedVisual\(PRESS_RELEASE_MS\)/);
    expect(src).toMatch(/const clickSuppressed = consumeClickSuppression\(\);/);
  });
  it("탭 폐기 이유 코드 계측(동작 변경 없음)", () => {
    for (const reason of ["lost_capture", "pointercancel", "suppressed_longpress", "not_armed", "swipe_open", "dragging"]) {
      expect(src).toContain(`"${reason}"`);
    }
    expect(src).toContain('"[cm-row-tap] dropped"');
  });
});
