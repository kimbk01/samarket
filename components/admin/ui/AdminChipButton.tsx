/**
 * Admin 칩·토글 버튼 (수정 계획 2-2) — 필터 칩·구간 선택처럼 「켜짐/꺼짐」이 있는 버튼.
 * 높이 32 · 선택 = aria-pressed + 강조. 화면에서 `<button>` 을 직접 쓰지 않고 이 부품을 쓴다.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function AdminChipButton({
  selected = false,
  count,
  className = "",
  children,
  type = "button",
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  selected?: boolean;
  /** 건수 배지 (null·undefined = 숨김) */
  count?: number | null;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      data-admin-chip={selected ? "on" : "off"}
      className={[
        "inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-[13px] leading-5 transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-accent)] disabled:opacity-50",
        selected
          ? "border-[var(--admin-console-accent)] bg-[var(--admin-console-active-bg)] font-semibold text-[var(--admin-console-accent)]"
          : "border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
      {count != null ? <span className="tabular-nums text-[12px] opacity-80">{count}</span> : null}
    </button>
  );
}
