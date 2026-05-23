"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 모바일·태블릿(≤1024px) 운영 메뉴 드로어 — `document.body` 포털.
 * Tailwind `max-[1024px]:*` 는 `${OWNER_COMPACT_SHELL_MAX_TW}:` 조합 시 빌드에서 누락될 수 있어
 * 위치·슬라이드는 `app/owner-compact-shell.css` 의 `.owner-ops-drawer-*` 가 단일 권한.
 */
export function OwnerMobileOpsMenuDrawer({
  open,
  onClose,
  scrimLabel,
  panelLabel,
  topBar,
  children,
}: {
  open: boolean;
  onClose: () => void;
  scrimLabel: string;
  panelLabel: string;
  topBar: ReactNode;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const dataOpen = open ? "true" : "false";

  return createPortal(
    <div data-biz="1" data-owner-ops-drawer-root aria-hidden={!open}>
      <button
        type="button"
        className="owner-ops-drawer-scrim"
        data-open={dataOpen}
        aria-label={scrimLabel}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={panelLabel}
        className="owner-ops-drawer-panel"
        data-open={dataOpen}
      >
        {topBar}
        {children}
      </aside>
    </div>,
    document.body
  );
}
