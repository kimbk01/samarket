import { useCallback, useRef, type ButtonHTMLAttributes, type MouseEvent, type PointerEvent } from "react";

/** 상단 정렬 칩(최신순 등): 빠른 탭은 주 동작, 길게 누름으로 부 메뉴 */
export const SORT_PRIMARY_CHIP_LONG_PRESS_MS = 480;

type NativeButtonProps = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onPointerLeave" | "onClick"
>;

/**
 * 짧은 탭은 `onTap`, 일정 시간 이상 누르면 `onLongPress` 만 (탭 없음).
 * 포인터 핑거레스트 후 합성 `click` 중복을 막는다.
 */
export function useLongPressOrTap(opts: {
  longPressMs?: number;
  onTap: () => void;
  onLongPress: () => void;
}): { buttonProps: NativeButtonProps } {
  const ms = opts.longPressMs ?? SORT_PRIMARY_CHIP_LONG_PRESS_MS;
  const timerRef = useRef<number | null>(null);
  const longDoneRef = useRef(false);
  const suppressNextClickRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      longDoneRef.current = false;
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        longDoneRef.current = true;
        suppressNextClickRef.current = true;
        opts.onLongPress();
      }, ms);
    },
    [clearTimer, ms, opts.onLongPress]
  );

  const finishPointer = useCallback(() => {
    clearTimer();
    const didLong = longDoneRef.current;
    longDoneRef.current = false;
    if (!didLong) {
      suppressNextClickRef.current = true;
      opts.onTap();
    }
  }, [clearTimer, opts.onTap]);

  const onPointerUp = useCallback(() => {
    finishPointer();
  }, [finishPointer]);

  const onPointerCancel = useCallback(() => {
    clearTimer();
    longDoneRef.current = false;
  }, [clearTimer]);

  const onPointerLeave = useCallback(() => {
    clearTimer();
    longDoneRef.current = false;
  }, [clearTimer]);

  const onClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        e.preventDefault();
        return;
      }
      opts.onTap();
    },
    [opts.onTap]
  );

  return {
    buttonProps: {
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onClick,
    },
  };
}
