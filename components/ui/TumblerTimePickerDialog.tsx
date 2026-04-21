"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hhmm24ToWheelParts, wheelPartsToHHmm24 } from "@/lib/utils/tumbler-time";

const ROW_PX = 40;
const VISIBLE_ROWS = 3;
const PICKER_H = ROW_PX * VISIBLE_ROWS;

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const AMPM_LABELS = ["AM", "PM"];

type WheelColumnProps = {
  labels: string[];
  selectedIndex: number;
  onChangeIndex: (i: number) => void;
  widthClass: string;
};

function WheelColumn({ labels, selectedIndex, onChangeIndex, widthClass }: WheelColumnProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToIndex = useCallback((idx: number, behavior: ScrollBehavior = "auto") => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(labels.length - 1, idx));
    el.scrollTo({ top: clamped * ROW_PX, behavior });
  }, [labels.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = selectedIndex * ROW_PX;
    if (Math.abs(el.scrollTop - target) < 3) return;
    el.scrollTo({ top: target, behavior: "auto" });
  }, [selectedIndex]);

  const flushIndexFromScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ROW_PX);
    const clamped = Math.max(0, Math.min(labels.length - 1, idx));
    onChangeIndex(clamped);
    scrollToIndex(clamped, "smooth");
  }, [labels.length, onChangeIndex, scrollToIndex]);

  const onScroll = () => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      scrollEndTimer.current = null;
      flushIndexFromScroll();
    }, 100);
  };

  return (
    <div className={`relative shrink-0 overflow-hidden ${widthClass}`} style={{ height: PICKER_H }}>
      <div
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 border-sky-400/90"
        style={{
          height: ROW_PX,
          borderTopWidth: 1,
          borderBottomWidth: 1,
        }}
        aria-hidden
      />
      <div
        ref={scrollerRef}
        role="listbox"
        tabIndex={0}
        onScroll={onScroll}
        onPointerUp={flushIndexFromScroll}
        onPointerCancel={flushIndexFromScroll}
        className="h-full overflow-y-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "y mandatory" }}
      >
        <div style={{ height: ROW_PX }} aria-hidden />
        {labels.map((label, i) => {
          const dist = Math.abs(i - selectedIndex);
          return (
            <div
              key={`${label}-${i}`}
              role="option"
              aria-selected={i === selectedIndex}
              className="flex shrink-0 items-center justify-center sam-text-section-title leading-none"
              style={{
                height: ROW_PX,
                scrollSnapAlign: "center",
                color: i === selectedIndex ? "#111827" : "#9ca3af",
                fontWeight: i === selectedIndex ? 700 : 400,
                opacity: dist > 1 ? 0.4 : dist === 1 ? 0.7 : 1,
              }}
            >
              {label}
            </div>
          );
        })}
        <div style={{ height: ROW_PX }} aria-hidden />
      </div>
    </div>
  );
}

export type TumblerTimePickerDialogProps = {
  open: boolean;
  title?: string;
  /** 24h HH:mm */
  valueHHmm: string;
  onClose: () => void;
  onConfirm: (hhmm24: string) => void;
};

export function TumblerTimePickerDialog({
  open,
  title = "시간 설정",
  valueHHmm,
  onClose,
  onConfirm,
}: TumblerTimePickerDialogProps) {
  const initial = hhmm24ToWheelParts(valueHHmm);
  const [h12, setH12] = useState(initial.h12);
  const [minute, setMinute] = useState(initial.minute);
  const [pm, setPm] = useState(initial.pm);

  useEffect(() => {
    if (!open) return;
    const p = hhmm24ToWheelParts(valueHHmm);
    setH12(p.h12);
    setMinute(p.minute);
    setPm(p.pm);
  }, [open, valueHHmm]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const hourIndex = h12 - 1;
  const minuteIndex = minute;
  const ampmIndex = pm ? 1 : 0;

  const done = () => {
    onConfirm(wheelPartsToHHmm24(h12, minute, pm));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tumbler-time-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[min(90dvh,520px)] w-full max-w-[340px] overflow-hidden rounded-ui-rect bg-sam-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-sky-200/80 px-4 py-3">
          <h2 id="tumbler-time-title" className="sam-text-body font-medium text-sky-500">
            {title}
          </h2>
        </div>

        <div className="flex items-center justify-center gap-0.5 px-3 py-5 sm:gap-1">
          <WheelColumn
            labels={HOURS}
            selectedIndex={hourIndex}
            onChangeIndex={(i) => setH12(i + 1)}
            widthClass="w-11"
          />
          <span className="mb-0.5 self-center px-0.5 sam-text-page-title font-semibold text-sam-fg" aria-hidden>
            :
          </span>
          <WheelColumn
            labels={MINUTES}
            selectedIndex={minuteIndex}
            onChangeIndex={setMinute}
            widthClass="w-12"
          />
          <WheelColumn
            labels={AMPM_LABELS}
            selectedIndex={ampmIndex}
            onChangeIndex={(i) => setPm(i === 1)}
            widthClass="w-14"
          />
        </div>

        <div className="border-t border-sam-border">
          <button
            type="button"
            onClick={done}
            className="w-full py-3.5 sam-text-body-lg font-bold text-sam-fg active:bg-sam-app"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}
