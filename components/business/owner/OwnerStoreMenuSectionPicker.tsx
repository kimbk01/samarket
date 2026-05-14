"use client";

import Link from "next/link";
import type { MutableRefObject } from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export type OwnerMenuSectionRow = { id: string; name: string; is_hidden?: boolean };

type OwnerStoreMenuSectionPickerProps = {
  /** `<label htmlFor>` 연결용 */
  id: string;
  sections: OwnerMenuSectionRow[];
  value: string;
  onChange: (sectionId: string) => void;
  disabled?: boolean;
  triggerClassName: string;
  categoriesHref: string;
};

/**
 * 네이티브 select 대신 — 긴 카테고리명 말줄임, 목록 폭을 부모에 맞춤(가로 넘침 방지).
 * 구역이 없을 때도 패널을 열어 하단 링크로 카테고리 관리 화면에 갈 수 있게 함.
 */
export const OwnerStoreMenuSectionPicker = forwardRef<HTMLButtonElement, OwnerStoreMenuSectionPickerProps>(
  function OwnerStoreMenuSectionPicker(
    { id, sections, value, onChange, disabled = false, triggerClassName, categoriesHref },
    ref
  ) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const listId = useId();
    const footerId = useId();

    const assignBtnRef = useCallback(
      (el: HTMLButtonElement | null) => {
        if (typeof ref === "function") {
          ref(el);
        } else if (ref) {
          (ref as MutableRefObject<HTMLButtonElement | null>).current = el;
        }
      },
      [ref]
    );

    const close = useCallback(() => setOpen(false), []);

    useEffect(() => {
      if (!open) return;
      const onDoc = (e: MouseEvent) => {
        if (!rootRef.current?.contains(e.target as Node)) close();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") close();
      };
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDoc);
        document.removeEventListener("keydown", onKey);
      };
    }, [open, close]);

    const selected = sections.find((s) => s.id === value);
    const label =
      selected != null
        ? `${selected.name}${selected.is_hidden ? " (숨김)" : ""}`
        : sections.length > 0
          ? "카테고리를 선택하세요"
          : "등록된 카테고리 없음 · 눌러 추가";

    const hasOptions = sections.length > 0;

    return (
      <div ref={rootRef} className="relative min-w-0 max-w-full">
        <button
          ref={assignBtnRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup={hasOptions ? "listbox" : "dialog"}
          aria-controls={open ? (hasOptions ? listId : footerId) : undefined}
          onClick={() => {
            if (!disabled) setOpen((o) => !o);
          }}
          className={`${triggerClassName} flex w-full min-w-0 max-w-full cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-not-allowed`}
        >
          <span className="min-w-0 flex-1 truncate" title={label}>
            {label}
          </span>
          <span className="shrink-0 text-sam-muted" aria-hidden>
            ▼
          </span>
        </button>
        {open && !disabled ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-[60] min-w-0 max-w-full overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-lg ring-1 ring-black/[0.04]"
            role={hasOptions ? "presentation" : "dialog"}
            aria-label={hasOptions ? undefined : "카테고리 추가"}
          >
            {hasOptions ? (
              <ul
                id={listId}
                role="listbox"
                className="max-h-[min(14rem,calc(100dvh-10rem))] overflow-x-hidden overflow-y-auto overscroll-contain py-1"
              >
                {sections.map((s) => {
                  const sel = s.id === value;
                  const text = `${s.name}${s.is_hidden ? " (숨김)" : ""}`;
                  return (
                    <li key={s.id} role="presentation" className="min-w-0 max-w-full">
                      <button
                        type="button"
                        role="option"
                        aria-selected={sel}
                        className={`flex w-full min-w-0 max-w-full items-center px-3 py-2.5 text-left sam-text-body-secondary hover:bg-sam-app ${
                          sel ? "bg-signature/10 font-semibold text-signature" : "text-sam-fg"
                        }`}
                        onClick={() => {
                          onChange(s.id);
                          close();
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate" title={text}>
                          {text}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div
              id={footerId}
              className={`min-w-0 max-w-full border-sam-border-soft ${hasOptions ? "border-t" : ""}`}
            >
              <Link
                href={categoriesHref}
                className="flex min-h-[44px] w-full min-w-0 max-w-full items-center px-3 py-2.5 sam-text-body-secondary font-bold text-signature hover:bg-sam-app"
                onClick={() => close()}
              >
                <span className="min-w-0 flex-1 truncate">+ 카테고리 추가 관리</span>
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
);
