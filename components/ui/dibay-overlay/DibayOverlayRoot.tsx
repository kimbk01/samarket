"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  OVERLAY_Z_CLASS,
  OverlayUi,
  type DibayOverlayZRole,
} from "@/lib/ui/dibay-overlay-contract";

const OVERLAY_HISTORY_KEY = "__dibayOverlay";

export type DibayOverlayRootProps = {
  open: boolean;
  onClose?: () => void;
  /** When false, backdrop click / Escape do not close. */
  dismissible?: boolean;
  placement: "center" | "sheet" | "full";
  zRole?: DibayOverlayZRole;
  zIndexClass?: string;
  labelledBy?: string;
  describedBy?: string;
  ariaLabel?: string;
  children: ReactNode;
  /** Extra class on the flex stage (not the backdrop). */
  stageClassName?: string;
  stageStyle?: CSSProperties;
  /** When false, skip body scroll lock (nested rare cases). */
  lockScroll?: boolean;
  /** Sheet only — lifts root above main bottom nav (CSS SSOT). */
  sheetAnchor?: "above-bottom-nav" | "device-bottom";
};

/**
 * Shared portal root — backdrop, z-index, scroll lock, Escape, system Back, a11y.
 */
export function DibayOverlayRoot({
  open,
  onClose,
  dismissible = true,
  placement,
  zRole = "dialog",
  zIndexClass,
  labelledBy,
  describedBy,
  ariaLabel,
  children,
  stageClassName = "",
  stageStyle,
  lockScroll = true,
  sheetAnchor,
}: DibayOverlayRootProps) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const historyTokenRef = useRef(`dibay-overlay-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    previouslyFocused.current =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open || !dismissible || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  /**
   * System Back / history.back must close the overlay first (not pop the route).
   * pushState while open; popstate → onClose. UI dismiss syncs with history.back().
   */
  useEffect(() => {
    if (!open || !dismissible || !onClose) return;
    if (typeof window === "undefined" || !window.history?.pushState) return;

    const token = historyTokenRef.current;
    const prev = window.history.state;
    const nextState = {
      ...(prev && typeof prev === "object" ? prev : {}),
      [OVERLAY_HISTORY_KEY]: token,
    };
    window.history.pushState(nextState, "");

    let settled = false;
    const closeFromHistory = () => {
      if (settled) return;
      settled = true;
      onClose();
    };

    const onPopState = () => {
      closeFromHistory();
    };
    window.addEventListener("popstate", onPopState);

    let removeCap: (() => void) | undefined;
    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("backButton", () => {
          // Capacitor overrides default Back — sync via history so popstate closes once.
          if (
            window.history.state &&
            typeof window.history.state === "object" &&
            (window.history.state as Record<string, unknown>)[OVERLAY_HISTORY_KEY] === token
          ) {
            window.history.back();
            return;
          }
          closeFromHistory();
        })
      )
      .then((handle) => {
        if (handle && typeof handle.remove === "function") {
          removeCap = () => {
            void handle.remove();
          };
        }
      })
      .catch(() => {
        /* web / no capacitor */
      });

    return () => {
      window.removeEventListener("popstate", onPopState);
      removeCap?.();
      if (settled) return;
      const st = window.history.state;
      if (st && typeof st === "object" && (st as Record<string, unknown>)[OVERLAY_HISTORY_KEY] === token) {
        settled = true;
        window.history.back();
      }
    };
  }, [open, dismissible, onClose]);

  useEffect(() => {
    if (!open || !lockScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, lockScroll]);

  useEffect(() => {
    if (open) return;
    const el = previouslyFocused.current;
    if (el && typeof el.focus === "function") {
      try {
        el.focus();
      } catch {
        /* ignore */
      }
    }
  }, [open]);

  if (!open || !mounted || typeof document === "undefined" || !document.body) return null;

  const placementClass =
    placement === "center"
      ? `${OverlayUi.root} dibay-overlay-root--center`
      : placement === "full"
        ? `${OverlayUi.root} dibay-overlay-root--full`
        : `${OverlayUi.root} dibay-overlay-root--sheet`;

  const zClass = zIndexClass ?? OVERLAY_Z_CLASS[zRole];
  const anchorAttr =
    placement === "sheet" && sheetAnchor ? { "data-sheet-anchor": sheetAnchor } : {};

  return createPortal(
    <div
      className={`${placementClass} ${zClass} ${stageClassName}`.trim()}
      style={stageStyle}
      data-entered={entered ? "true" : "false"}
      role="presentation"
      {...anchorAttr}
    >
      {dismissible && onClose ? (
        <button
          type="button"
          className={OverlayUi.backdrop}
          aria-label="Close"
          onClick={onClose}
        />
      ) : (
        <div className={OverlayUi.backdrop} aria-hidden />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        className={
          placement === "center"
            ? "relative z-[1] flex w-full max-w-full items-center justify-center"
            : placement === "full"
              ? "relative z-[1] flex h-full min-h-0 w-full flex-col"
              : "relative z-[1] flex max-h-full w-full flex-col items-center justify-end"
        }
        style={placement === "full" ? { height: "100%" } : undefined}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function useOverlayTitleIds(prefix = "dibay-overlay") {
  const base = useId();
  return {
    titleId: `${prefix}-title-${base}`,
    bodyId: `${prefix}-body-${base}`,
  };
}
