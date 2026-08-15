"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  MAIN_BOTTOM_NAV_SHEET_Z_CLASS,
  MESSENGER_HOME_BOTTOM_SHEET_DEVICE_BOTTOM_CLASS,
  MESSENGER_HOME_BOTTOM_SHEET_PANEL_CLASS,
  MESSENGER_SETTINGS_SHEET_DEVICE_HEIGHT_RATIO,
} from "@/lib/main-menu/bottom-nav-config";

export type MessengerHomeBottomSheetAnchor = "above-bottom-nav" | "device-bottom" | "center";

/**
 * 메신저 홈(채팅·친구·모임) 오버레이 — `body` 포털·본문 스크롤.
 * - `above-bottom-nav`: 하단 탭 상단에 맞춤(알림 등)
 * - `device-bottom`: 기기 최하단에서 뷰포트 비율만큼 올라옴(설정·그룹 생성, 기본 70%)
 * - `center`: 화면 중앙 팝업(친구 추가)
 */
export function MessengerHomeBottomSheetShell({
  onClose,
  closeAriaLabel,
  children,
  panelClassName = "",
  dialogAriaLabel,
  anchor = "above-bottom-nav",
  deviceHeightRatio = MESSENGER_SETTINGS_SHEET_DEVICE_HEIGHT_RATIO,
}: {
  onClose: () => void;
  closeAriaLabel: string;
  children: ReactNode;
  panelClassName?: string;
  dialogAriaLabel?: string;
  anchor?: MessengerHomeBottomSheetAnchor;
  /** `anchor="device-bottom"` 일 때 패널 높이(뷰포트 비율, 0.7 = 70%) */
  deviceHeightRatio?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || (anchor !== "device-bottom" && anchor !== "center")) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [mounted, anchor]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  if (!mounted || typeof document === "undefined" || !document.body) return null;

  const deviceBottom = anchor === "device-bottom";
  const center = anchor === "center";
  const panelAnchorClass = deviceBottom
    ? MESSENGER_HOME_BOTTOM_SHEET_DEVICE_BOTTOM_CLASS
    : center
      ? "messenger-home-center-sheet-panel"
      : MESSENGER_HOME_BOTTOM_SHEET_PANEL_CLASS;
  const panelMotionClass =
    deviceBottom ?
      entered ? "messenger-home-bottom-sheet-panel--entered" : "messenger-home-bottom-sheet-panel--entering"
    : center ?
      entered ? "messenger-home-center-sheet-panel--entered" : "messenger-home-center-sheet-panel--entering"
    : "";

  return createPortal(
    <div
      className={`fixed inset-0 ${MAIN_BOTTOM_NAV_SHEET_Z_CLASS}`}
      role="presentation"
      data-dibay-overlay="messenger-home-sheet"
      data-overlay-anchor={anchor}
    >
      <button
        type="button"
        className="dibay-overlay-backdrop absolute inset-0 !opacity-100"
        aria-label={closeAriaLabel}
        onClick={onClose}
      />
      <div
        data-messenger-shell
        role="dialog"
        aria-modal="true"
        aria-label={dialogAriaLabel}
        style={
          deviceBottom ?
            ({
              "--messenger-home-sheet-device-height": `${Math.min(1, Math.max(0.25, deviceHeightRatio)) * 100}dvh`,
            } as CSSProperties)
          : undefined
        }
        className={`${center ? "fixed" : "absolute inset-x-0 w-full"} flex flex-col overflow-hidden border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] shadow-[var(--overlay-elevation-3)] ${center ? "rounded-[length:var(--overlay-radius-lg)]" : "rounded-t-[length:var(--overlay-radius-xl)]"} ${panelAnchorClass} ${panelMotionClass} ${panelClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function MessengerSettingsBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3
        className="mb-2 sam-text-xxs font-semibold tracking-wide"
        style={{ color: "var(--messenger-text-secondary)" }}
      >
        {title}
      </h3>
      <div className="divide-y divide-[color:var(--messenger-divider)] overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] shadow-[var(--messenger-shadow-soft)]">
        {children}
      </div>
    </section>
  );
}

export function SettingsToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-3 px-3 py-2 ${disabled ? "opacity-50" : ""}`}>
      <span className="min-w-0">
        <span className="block sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block sam-text-helper leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-[color:var(--messenger-divider)] accent-[color:var(--messenger-primary)] focus:ring-[color:var(--messenger-primary-soft-2)]"
      />
    </label>
  );
}

export function SettingsActionRow({
  title,
  description,
  actionLabel,
  disabled,
  onClick,
}: {
  title: string;
  description?: string;
  actionLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left ${disabled ? "opacity-50" : ""}`}
    >
      <span className="min-w-0">
        <span className="block sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block sam-text-helper leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
            {description}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 sam-text-helper font-medium text-[color:var(--messenger-primary)]">{actionLabel}</span>
    </button>
  );
}
