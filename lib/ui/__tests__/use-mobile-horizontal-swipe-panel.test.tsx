/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  SWIPE_SETTLE_TIMEOUT_MS,
  useMobileHorizontalSwipePanel,
  type SwipeCommitResult,
} from "@/lib/ui/use-mobile-horizontal-swipe-panel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HarnessProps = {
  onNext: () => SwipeCommitResult;
  onPrev: () => SwipeCommitResult;
  settleKey?: string;
  canGoPrev?: boolean;
};

function Harness({ onNext, onPrev, settleKey, canGoPrev = true }: HarnessProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { setSwipeableEl } = useMobileHorizontalSwipePanel({
    enabled: true,
    swipeableRef: ref,
    onCommitNext: onNext,
    onCommitPrev: onPrev,
    canGoNext: true,
    canGoPrev,
    settleKey,
  });
  return <div data-testid="panel" ref={setSwipeableEl} />;
}

let host: HTMLDivElement;
let root: Root;

function render(props: HarnessProps) {
  act(() => {
    root.render(<Harness {...props} />);
  });
}

const panel = () => host.querySelector<HTMLElement>("[data-testid=panel]")!;

function touch(type: string, x: number, y = 100) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const touches = type === "touchend" || type === "touchcancel" ? [] : [{ clientX: x, clientY: y }];
  Object.defineProperty(ev, "touches", { value: touches });
  panel().dispatchEvent(ev);
}

/** 손가락 1회: 200 → 200+dx 수평 드래그 후 놓기 */
function swipe(dx: number) {
  act(() => {
    touch("touchstart", 200);
    touch("touchmove", 200 + dx / 2);
    touch("touchmove", 200 + dx);
    touch("touchend", 200 + dx);
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("useMobileHorizontalSwipePanel — legacy (settleKey 없음, 거래)", () => {
  it("나간 뒤 고정 cleanup 시점에 원위치 — 기존 동작 유지", () => {
    const onNext = vi.fn();
    render({ onNext, onPrev: vi.fn() });
    swipe(-150);
    advance(20);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(panel().style.transform).toBe("translate3d(-400px,0,0)");
    advance(500);
    expect(panel().style.transform).toBe("translate3d(0,0,0)");
  });
});

describe("useMobileHorizontalSwipePanel — settle 모드 (커뮤니티)", () => {
  it("목적지 key 가 오기 전에는 나간 상태로 대기, key 변경 후 반대편(+w)에서 1회 진입", () => {
    const onNext = vi.fn(() => true);
    render({ onNext, onPrev: vi.fn(), settleKey: "a" });
    swipe(-150);
    advance(400);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(panel().style.transform).toBe("translate3d(-400px,0,0)");
    advance(1000);
    expect(panel().style.transform).toBe("translate3d(-400px,0,0)");

    render({ onNext, onPrev: vi.fn(), settleKey: "b" });
    expect(panel().style.transform).toBe("translate3d(0,0,0)");
    expect(panel().style.transition).toContain("transform 280ms");
    advance(400);
    expect(panel().style.transition).toBe("none");
    expect(panel().style.transform).toBe("translate3d(0,0,0)");
  });

  it("나가는 동안에는 이동하지 않는다 — 목적지 콘텐츠 교체는 화면 밖에서만, 그 사이 key 변화는 진입 신호가 아님", () => {
    const onNext = vi.fn(() => true);
    render({ onNext, onPrev: vi.fn(), settleKey: "a" });
    swipe(-150);
    advance(100);
    expect(onNext).not.toHaveBeenCalled();
    render({ onNext, onPrev: vi.fn(), settleKey: "a2" });
    advance(300);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(panel().style.transform).toBe("translate3d(-400px,0,0)");
    render({ onNext, onPrev: vi.fn(), settleKey: "b" });
    advance(400);
    expect(panel().style.transform).toBe("translate3d(0,0,0)");
    expect(panel().style.transition).toBe("none");
  });

  it.each([
    ["next", -150, "translate3d(-400px,0,0)", "translate3d(400px,0,0)"],
    ["prev", 150, "translate3d(400px,0,0)", "translate3d(-400px,0,0)"],
  ] as const)("%s: 나간 쪽의 반대편에서 진입 (순간이동·같은 쪽 재진입 없음)", (_dir, dx, exitX, enterFromX) => {
    const onNext = vi.fn(() => true);
    const onPrev = vi.fn(() => true);
    render({ onNext, onPrev, settleKey: "a" });
    swipe(dx);
    advance(400);
    expect(panel().style.transform).toBe(exitX);

    /** 진입 단계의 transform 순서를 style setter 에서 직접 기록 */
    const recorded: string[] = [];
    const style = panel().style;
    const proto = Object.getPrototypeOf(style) as object;
    const desc = Object.getOwnPropertyDescriptor(proto, "transform")!;
    Object.defineProperty(style, "transform", {
      configurable: true,
      get: () => desc.get!.call(style) as string,
      set: (v: string) => {
        recorded.push(v);
        desc.set!.call(style, v);
      },
    });
    render({ onNext, onPrev, settleKey: "b" });
    advance(400);
    expect(recorded).toEqual([enterFromX, "translate3d(0,0,0)", "translate3d(0,0,0)"]);
  });

  it("onCommit 이 false (이동 거부) → 원위치 복구, 진입 없음", () => {
    const onNext = vi.fn(() => false);
    render({ onNext, onPrev: vi.fn(), settleKey: "a" });
    swipe(-150);
    advance(400);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(panel().style.transform).toBe("translate3d(0,0,0)");
    expect(panel().style.transition).toContain("transform 320ms");
    advance(500);
    expect(panel().style.transition).toBe("none");
  });

  it("목적지가 끝내 그려지지 않으면 안전장치 시간에 원위치 복구", () => {
    render({ onNext: vi.fn(() => true), onPrev: vi.fn(), settleKey: "a" });
    swipe(-150);
    advance(400);
    advance(SWIPE_SETTLE_TIMEOUT_MS - 100);
    expect(panel().style.transform).toBe("translate3d(-400px,0,0)");
    advance(100);
    expect(panel().style.transform).toBe("translate3d(0,0,0)");
    expect(panel().style.transition).toContain("transform 320ms");
  });

  it("전환 중 두 번째 스와이프는 무시 — 이동 1회", () => {
    const onNext = vi.fn(() => true);
    render({ onNext, onPrev: vi.fn(), settleKey: "a" });
    swipe(-150);
    advance(100);
    swipe(-150);
    swipe(150);
    advance(400);
    expect(onNext).toHaveBeenCalledTimes(1);
    render({ onNext, onPrev: vi.fn(), settleKey: "b" });
    advance(400);
    swipe(-150);
    advance(400);
    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it("전환 중 언마운트 — 타이머 정리, 이후 콜백 없음", () => {
    const onNext = vi.fn(() => true);
    render({ onNext, onPrev: vi.fn(), settleKey: "a" });
    swipe(-150);
    act(() => root.unmount());
    root = createRoot(host);
    expect(() => advance(SWIPE_SETTLE_TIMEOUT_MS + 1000)).not.toThrow();
    expect(onNext).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
