"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";
import { useOverlayScopeAttrs } from "@/components/ui/dibay-overlay/overlay-scope";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function listFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.closest("[hidden]") && !el.closest("[inert]") && el.getAttribute("aria-hidden") !== "true"
  );
}

/**
 * 모바일·태블릿 운영 메뉴 사이드 드로어 — `document.body` 포털.
 * Intentional side drawer (not DibayBottomSheet): ops nav from hamburger.
 * Scrim uses `--overlay-backdrop` via `app/owner-compact-shell.css`.
 * 위치·슬라이드는 `.owner-ops-drawer-*` 가 단일 권한.
 *
 * 4단계 IA-20 접근성: 열린 동안 전역 ESC 로 닫기 · Tab/Shift+Tab 포커스 트랩(패널 안 순환) ·
 * 열 때 첫 항목으로 포커스 이동 · 닫을 때 연 요소(햄버거)로 포커스 복귀.
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
  /** 포털 루트에 화면 스코프(`data-delivery-scope` 등) — `overlay-scope.tsx` */
  const scopeAttrs = useOverlayScopeAttrs();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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
    onCloseRef.current();
  }, []);

  /** IA-20 — Android 하드웨어 뒤로가기는 열린 드로어만 닫는다 (INAPP-07 오버레이 백 스택, 실기기 FAIL 수정). */
  useOverlayHardwareBack(open && mounted, closeDrawer);

  useEffect(() => {
    if (!open || !mounted) return;
    const root = rootRef.current;
    const panel = panelRef.current;
    const previous = document.activeElement;
    const returnTarget =
      previous instanceof HTMLElement && !(root?.contains(previous) ?? false) ? previous : null;

    if (panel) {
      const first = listFocusable(panel)[0];
      (first ?? panel).focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = listFocusable(panel);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first || active === panel) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (returnTarget && returnTarget.isConnected) {
        returnTarget.focus({ preventScroll: true });
      } else {
        releaseDrawerFocus();
      }
    };
  }, [open, mounted, releaseDrawerFocus]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const dataOpen = open ? "true" : "false";

  return createPortal(
    <div
      ref={rootRef}
      data-biz="1"
      {...scopeAttrs}
      data-owner-ops-drawer-root
      data-open={dataOpen}
      data-dibay-overlay="owner-ops-side-drawer"
      inert={!open}
    >
      <button
        type="button"
        className="owner-ops-drawer-scrim"
        data-open={dataOpen}
        aria-label={scrimLabel}
        tabIndex={-1}
        onClick={closeDrawer}
      />
      <aside
        ref={panelRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={panelLabel}
        className="owner-ops-drawer-panel"
        data-open={dataOpen}
        tabIndex={-1}
      >
        {topBar}
        {children}
      </aside>
    </div>,
    document.body
  );
}
