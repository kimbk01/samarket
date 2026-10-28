"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";

export type WriteSelectSheetOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** 고를 수 없는 이유(예: 「작성 불가」) — 흐린 글자 뒤에 붙는다 */
  disabledSuffix?: string;
};

/**
 * 글쓰기 선택 칸 (Owner 2026-10-28 승인 시안) — 브라우저 기본 `<select>` 대신 앱 바텀시트 하나.
 * 기본 `<select>` 는 Android 기기마다 창이 달랐다(삼성 = 라디오 목록 창, 샤오미 = 드롭다운).
 * - 칸: 고른 값(없으면 안내 문구) + ▼ — 값은 앱이 직접 그린다.
 * - 시트: 고른 항목 ✓, 누르면 바로 닫힘, 고를 수 없는 항목은 흐리게.
 * - `clearable` 이면 맨 위에 안내 문구 행(선택 해제).
 */
export function WriteSelectSheetField({
  id,
  value,
  onChange,
  options,
  placeholder,
  sheetTitle,
  clearable = false,
  disabled = false,
  invalid = false,
  className,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  options: WriteSelectSheetOption[];
  placeholder: string;
  sheetTitle: string;
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** 칸 모양 — 각 폼의 기존 입력 칸 클래스 */
  className: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const selected = value ? options.find((o) => o.value === value) : undefined;
  const rows: WriteSelectSheetOption[] = clearable ? [{ value: "", label: placeholder }, ...options] : options;

  /** 긴 목록(연식·브랜드)은 고른 항목이 보이게 연다 */
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => selectedRef.current?.scrollIntoView({ block: "center" }));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const pick = (next: string) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  return (
    <>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        data-write-select-sheet-field="1"
        onClick={() => setOpen(true)}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:opacity-60`}
      >
        <span className={`min-w-0 truncate ${selected ? "" : "text-sam-meta"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-sam-muted" aria-hidden />
      </button>
      <DibayBottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={sheetTitle}
        zIndexClass={MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS}
      >
        <ul role="listbox" aria-label={sheetTitle} data-write-select-sheet-list="1">
          {rows.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value || "__empty"}>
                <button
                  ref={active ? selectedRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={o.disabled}
                  onClick={() => pick(o.value)}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 border-b border-sam-border-soft px-1 py-2.5 text-left text-[15px] last:border-b-0 disabled:text-sam-meta ${
                    active ? "font-semibold text-sam-primary" : o.value ? "text-sam-fg" : "text-sam-muted"
                  }`}
                >
                  <span className="min-w-0 break-words">
                    {o.label}
                    {o.disabled && o.disabledSuffix ? o.disabledSuffix : ""}
                  </span>
                  {active ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </DibayBottomSheet>
    </>
  );
}
