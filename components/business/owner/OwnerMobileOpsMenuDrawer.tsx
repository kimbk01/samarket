"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  const releaseDrawerFocus = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && root.contains(active)) {
      active.blur();
    }
  }, []);

  const closeDrawer = useCallback(() => {
    releaseDrawerFocus();
    onClose();
  }, [onClose, releaseDrawerFocus]);

  useLayoutEffect(() => {
    if (open) return;
    releaseDrawerFocus();
  }, [open, releaseDrawerFocus]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const dataOpen = open ? "true" : "false";

  return createPortal(
    <div ref={rootRef} data-biz="1" data-owner-ops-drawer-root inert={!open}>
      <button
        type="button"
        className="owner-ops-drawer-scrim"
        data-open={dataOpen}
        aria-label={scrimLabel}
        tabIndex={open ? 0 : -1}
        onClick={closeDrawer}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            closeDrawer();
          }
        }}
      />
      <aside
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
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
