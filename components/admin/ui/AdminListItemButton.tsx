/**
 * Admin 목록 항목 버튼 (수정 계획 2-2) — 왼쪽 목록에서 항목을 고르는 행(여러 줄 내용).
 * 선택 = aria-current + 강조. 화면에서 `<button>` 으로 목록 행을 직접 그리지 않고 이 부품을 쓴다.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function AdminListItemButton({
  selected = false,
  className = "",
  children,
  type = "button",
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-current"> & {
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      aria-current={selected ? "true" : undefined}
      data-admin-list-item={selected ? "on" : "off"}
      className={[
        "block w-full rounded-ui-rect px-2 py-2 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-accent,#1d4ed8)] disabled:opacity-50",
        selected
          ? "bg-[var(--admin-console-active-bg,#e8eefc)] ring-1 ring-[var(--admin-console-accent,#1d4ed8)]"
          : "hover:bg-[var(--admin-console-hover,#eef1f6)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
