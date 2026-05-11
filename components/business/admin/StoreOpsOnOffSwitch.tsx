"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** 승인 매장 운영 — 노출·영업 토글 공통 (ON 시 트랙 `#1C8DB8`) */
const TRACK_ON = "#1C8DB8";
const TRACK_ON_BORDER = "#157aa0";
const THUMB_PX = 28;
const PAD_PX = 4;
const TAP_SLIP_PX = 10;

type DragSession = {
  pointerId: number;
  startClientX: number;
  minL: number;
  maxL: number;
  offsetX: number;
  lastLeft: number;
  moved: boolean;
};

export type StoreOpsOnOffSwitchProps = {
  /** 부모의 `pendingUi ?? 서버값` — 뱃지·스위치 동일 소스 */
  checked: boolean;
  onCheckedChange: (next: boolean) => boolean | Promise<boolean>;
  disabled?: boolean;
  ariaLabel: string;
};

export function StoreOpsOnOffSwitch({
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
}: StoreOpsOnOffSwitchProps) {
  const trackRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const checkedRef = useRef(checked);
  checkedRef.current = checked;

  const [dragLeft, setDragLeft] = useState<number | null>(null);
  const [dragBounds, setDragBounds] = useState<{ minL: number; maxL: number } | null>(null);
  const [bounds, setBounds] = useState<{ minL: number; maxL: number } | null>(null);

  useEffect(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragLeft(null);
    setDragBounds(null);
  }, [checked]);

  const measureEl = useCallback((el: HTMLElement) => {
    const w = el.getBoundingClientRect().width;
    const minL = PAD_PX;
    const maxL = Math.max(minL, w - THUMB_PX - PAD_PX);
    return { minL, maxL };
  }, []);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const apply = () => setBounds(measureEl(el));
    apply();
    const ro = new ResizeObserver(() => apply());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureEl]);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return null;
    return measureEl(el);
  }, [measureEl]);

  const commitChange = useCallback(
    async (next: boolean) => {
      if (next === checkedRef.current) return;
      try {
        await Promise.resolve(onCheckedChange(next));
      } catch {
        /* 부모가 pending 정리 */
      }
    },
    [onCheckedChange]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || e.button !== 0) return;
      const m = measure();
      if (!m) return;
      const base = checkedRef.current ? m.maxL : m.minL;
      const thumbCenter = base + THUMB_PX / 2;
      const offsetX = e.clientX - thumbCenter;
      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        minL: m.minL,
        maxL: m.maxL,
        offsetX,
        lastLeft: base,
        moved: false,
      };
      setDragBounds({ minL: m.minL, maxL: m.maxL });
      setDragLeft(base);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [disabled, measure]
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    d.moved = true;
    const center = e.clientX - d.offsetX;
    const left = Math.min(d.maxL, Math.max(d.minL, center - THUMB_PX / 2));
    d.lastLeft = left;
    setDragLeft(left);
  }, []);

  const finishPointer = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;

      const { minL, maxL, startClientX, lastLeft, moved } = d;
      dragRef.current = null;
      setDragLeft(null);
      setDragBounds(null);

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }

      const vis = checkedRef.current;

      const tap = !moved || Math.abs(e.clientX - startClientX) < TAP_SLIP_PX;
      if (tap) {
        void commitChange(!vis);
        return;
      }
      const mid = (minL + maxL) / 2;
      const shouldOn = lastLeft >= mid;
      if (shouldOn !== vis) {
        void commitChange(shouldOn);
      }
    },
    [commitChange]
  );

  const dragging = dragLeft != null && dragBounds != null;
  const trackShowsOn = dragging
    ? dragLeft! >= (dragBounds!.minL + dragBounds!.maxL) / 2
    : checked;

  const trackStyle: React.CSSProperties = trackShowsOn
    ? { backgroundColor: TRACK_ON, borderColor: TRACK_ON_BORDER }
    : {
        backgroundColor: "var(--sam-surface-muted, #f3f4f6)",
        borderColor: "var(--sam-border-soft, #e5e7eb)",
      };

  const restingThumbLeft =
    !dragging && bounds != null ? (checked ? bounds.maxL : bounds.minL) : null;

  return (
    <button
      ref={trackRef}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      className={[
        "relative h-9 w-[4.875rem] shrink-0 touch-none rounded-full border select-none",
        "focus-visible:outline focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#1C8DB8]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        dragging ? "" : "transition-[background-color,border-color,box-shadow]",
        trackShowsOn && !dragging ? "shadow-sm" : "",
      ].join(" ")}
      style={trackStyle}
    >
      <span
        className={[
          "absolute top-1 z-[1] h-7 w-7 rounded-full bg-white shadow-md ring-1 ring-black/[0.06]",
          dragging ? "" : "transition-[left] duration-200 ease-out",
          restingThumbLeft == null && !dragging
            ? checked
              ? "left-[calc(100%-2rem)]"
              : "left-1"
            : "",
        ].join(" ")}
        style={
          dragging && dragLeft != null
            ? { left: dragLeft, transition: "none" }
            : restingThumbLeft != null
              ? { left: restingThumbLeft }
              : undefined
        }
        aria-hidden
      />
      {/* ON일 때 썸은 오른쪽 → 라벨은 왼쪽. OFF일 때 썸은 왼쪽 → 라벨은 오른쪽 (겹침 방지) */}
      <span
        className="pointer-events-none absolute inset-0 z-[2] sam-text-[11px] font-bold uppercase leading-none tracking-wide"
        aria-hidden
      >
        <span
          className={[
            "absolute top-1/2 -translate-y-1/2",
            trackShowsOn ? "left-2 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" : "right-2 text-sam-fg",
          ].join(" ")}
        >
          {trackShowsOn ? "ON" : "OFF"}
        </span>
      </span>
    </button>
  );
}
