"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { TRADE_WRITE_FB_CONTROL } from "@/lib/ui/trade-write-fb-ui";

/** 글쓰기 시트(`MAIN_BOTTOM_NAV_SHEET_Z_CLASS` z-1300) 위에 떠야 한다 */
const PANEL_Z_INDEX = 1350;

export type PhilifeWriteTopicDropdownOption = { slug: string; label: string };

type Props = {
  options: PhilifeWriteTopicDropdownOption[];
  /** 선택 slug — 빈 문자열이면 미선택 */
  value: string;
  onChange: (slug: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** 목록에 없는 기존 주제(숨김·운영 중지) 표시 문구 — 수정 모드 */
  unlistedValueLabel?: string | null;
  invalid?: boolean;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const PANEL_MAX_PX = 320;
const PANEL_GAP_PX = 6;

/**
 * 글쓰기 주제 드롭다운 — native select 대신 iOS/APK/Windows 동일 UI.
 * 주제가 늘어나도 패널 안에서 스크롤(최대 320px), 아래 공간이 부족하면 위로 펼친다.
 * 패널은 body 포털 + fixed — 시트 스크롤 영역에 잘리지 않는다.
 */
export function PhilifeWriteTopicDropdown({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
  unlistedValueLabel,
  invalid = false,
  disabled = false,
  open,
  onOpenChange,
}: Props) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(
    null
  );
  const [activeIndex, setActiveIndex] = useState(-1);

  const selected = options.find((o) => o.slug === value) ?? null;
  const triggerText = selected?.label ?? (value && unlistedValueLabel ? unlistedValueLabel : "");

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const below = viewportBottom - r.bottom - PANEL_GAP_PX - 8;
    const above = r.top - PANEL_GAP_PX - 8;
    const openUp = below < 200 && above > below;
    const maxHeight = Math.max(160, Math.min(PANEL_MAX_PX, openUp ? above : below));
    setPos(
      openUp
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + PANEL_GAP_PX, maxHeight }
        : { left: r.left, width: r.width, top: r.bottom + PANEL_GAP_PX, maxHeight }
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    setActiveIndex(Math.max(0, options.findIndex((o) => o.slug === value)));
  }, [open, measure, options, value]);

  useEffect(() => {
    if (!open) return;
    const close = () => onOpenChange(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    const onScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      close();
    };
    window.addEventListener("resize", close);
    window.visualViewport?.addEventListener("resize", measure);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("resize", close);
      window.visualViewport?.removeEventListener("resize", measure);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, onOpenChange, measure]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    panelRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const pick = (slug: string) => {
    onChange(slug);
    onOpenChange(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Escape" && open) {
      e.preventDefault();
      onOpenChange(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        onOpenChange(true);
        return;
      }
      setActiveIndex((i) => {
        const n = options.length;
        if (!n) return -1;
        return e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n;
      });
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && open && activeIndex >= 0 && options[activeIndex]) {
      e.preventDefault();
      pick(options[activeIndex]!.slug);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => onOpenChange(!open)}
        onKeyDown={onKeyDown}
        className={`${TRADE_WRITE_FB_CONTROL} flex min-h-12 items-center justify-between gap-2 text-left transition-colors active:bg-sam-surface-muted disabled:opacity-60 ${
          open ? "border-sam-primary" : invalid ? "border-sam-danger" : ""
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${triggerText ? "font-semibold text-sam-fg" : "text-sam-meta"}`}>
          {triggerText || placeholder}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-sam-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          strokeWidth={2.2}
          aria-hidden
        />
      </button>
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={panelRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="overflow-y-auto overscroll-contain rounded-sam-md border border-sam-border bg-sam-surface py-1 shadow-sam-elevated"
              style={{
                position: "fixed",
                left: pos.left,
                width: pos.width,
                top: pos.top,
                bottom: pos.bottom,
                maxHeight: pos.maxHeight,
                zIndex: PANEL_Z_INDEX,
              }}
            >
              {options.map((o, i) => {
                const isSelected = o.slug === value;
                const isActive = i === activeIndex;
                return (
                  <li key={o.slug} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-index={i}
                      onClick={() => pick(o.slug)}
                      onPointerEnter={() => setActiveIndex(i)}
                      className={`flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[15px] transition-colors active:bg-sam-primary-soft ${
                        isSelected
                          ? "font-semibold text-sam-primary"
                          : "font-medium text-sam-fg"
                      } ${isActive ? "bg-sam-surface-muted" : ""}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {isSelected ? <Check className="h-5 w-5 shrink-0" strokeWidth={2.4} aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body
          )
        : null}
    </>
  );
}
