"use client";

import { useCallback, useEffect, useRef } from "react";

const KNOB = 46;
const ACCEPT_AT = 0.88;

/**
 * 드래그 중 React state 를 쓰지 않고 transform 만 갱신 — 통화 화면 전체 리렌더를 줄인다.
 */
export function SlideToAccept({
  label = "밀어서 통화하기",
  disabled = false,
  onAccept,
}: {
  label?: string;
  disabled?: boolean;
  onAccept: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLButtonElement | null>(null);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const acceptedRef = useRef(false);
  const progressRef = useRef(0);

  const applyProgress = useCallback((p: number) => {
    const track = trackRef.current;
    const knob = knobRef.current;
    if (!track || !knob) return;
    const rect = track.getBoundingClientRect();
    const max = Math.max(0, rect.width - KNOB);
    const clamped = Math.min(1, Math.max(0, p));
    progressRef.current = clamped;
    knob.style.transform = `translateX(${Math.round(max * clamped)}px)`;
  }, []);

  const progressFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const max = Math.max(0, rect.width - KNOB);
      if (max <= 0) return;
      const x = clientX - rect.left - KNOB / 2;
      applyProgress(x / max);
    },
    [applyProgress]
  );

  const finishAccept = useCallback(() => {
    if (acceptedRef.current) return;
    acceptedRef.current = true;
    applyProgress(1);
    onAccept();
  }, [applyProgress, onAccept]);

  useEffect(() => {
    if (!disabled) return;
    acceptedRef.current = false;
    applyProgress(0);
  }, [disabled, applyProgress]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => applyProgress(progressRef.current));
    ro.observe(track);
    return () => ro.disconnect();
  }, [applyProgress]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || acceptedRef.current) return;
      draggingRef.current = true;
      pointerIdRef.current = e.pointerId;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      progressFromClientX(e.clientX);
    },
    [disabled, progressFromClientX]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !draggingRef.current || pointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      progressFromClientX(e.clientX);
    },
    [disabled, progressFromClientX]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return;
      draggingRef.current = false;
      pointerIdRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (acceptedRef.current) return;
      if (progressRef.current >= ACCEPT_AT) {
        finishAccept();
      } else {
        applyProgress(0);
      }
    },
    [applyProgress, finishAccept]
  );

  return (
    <div
      ref={trackRef}
      className={`relative h-[54px] w-full rounded-full border border-white/10 bg-white/10 px-1 backdrop-blur-sm ${
        disabled ? "opacity-60" : ""
      }`.trim()}
      aria-label={label}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
        <span className="select-none sam-text-body font-semibold tracking-tight text-white/85">{label}</span>
      </div>
      <button
        ref={knobRef}
        type="button"
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute left-1 top-1 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-white text-[#1b1f2a] shadow-[0_10px_22px_rgba(0,0,0,0.24)] disabled:opacity-60"
        style={{ transform: "translateX(0px)" }}
        aria-label="accept"
      >
        <span className="sam-text-page-title font-black leading-none">{">"}</span>
      </button>
    </div>
  );
}
