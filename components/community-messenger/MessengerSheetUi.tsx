"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";
import { DibaySheetHeader } from "@/components/ui/dibay-overlay";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import {
  MAIN_BOTTOM_NAV_SHEET_Z_CLASS,
  MESSENGER_HOME_BOTTOM_SHEET_DEVICE_BOTTOM_CLASS,
  MESSENGER_HOME_BOTTOM_SHEET_PANEL_CLASS,
  MESSENGER_SETTINGS_SHEET_DEVICE_HEIGHT_RATIO,
} from "@/lib/main-menu/bottom-nav-config";
import { MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS } from "@/lib/ui/messenger-split-pane-layout";
import { useRegisterOpenOverlay } from "@/lib/ui/use-register-open-overlay";

export type MessengerHomeBottomSheetAnchor = "fit-content" | "device-bottom" | "center";

/**
 * 메신저 홈(채팅·친구·모임) 오버레이 — `body` 포털·본문 스크롤.
 * - `fit-content`: 기기 최하단에서 내용 높이만큼 올라옴(알림·친구 요청 등) — 하단 탭을 덮는다 (Owner 2026-11-01)
 * - `device-bottom`: 기기 최하단에서 뷰포트 비율만큼 올라옴(설정·그룹 생성, 기본 70%)
 * - 하단 시트의 safe-bottom 은 각 본문 `pb-[max(1rem,var(--safe-bottom))]` 한 번.
 * - `center`: 화면 중앙 팝업(친구 추가)
 *
 * CONTRACT: 패널은 항상 `absolute inset-x-0 w-full`(또는 center fixed).
 * 키보드(Form SSOT 공유 측정): 닫힘 = 기기 하단. 열림 = 루트를 visualViewport 밴드로 줄이고
 * (`data-kb-band`) 패널 하단 = 키보드 상단·높이 ≤ 밴드 — safe·키보드 px 를 다시 더하지 않는다.
 * ≥768 list-pane 폭은 `MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS` + CSS media 만 — 하단 시트(center 제외)에는 셸이 항상 붙인다.
 * DO NOT 클래스 유무로 inset-x 를 제거 (폰 APK/iOS 전폭 붕괴).
 */
export function MessengerHomeBottomSheetShell({
  onClose,
  closeAriaLabel,
  children,
  panelClassName = "",
  dialogAriaLabel,
  anchor = "fit-content",
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { keyboardOpen, effectiveViewportBottom, visualViewportHeight, visualViewportOffsetTop } =
    useFormKeyboardViewport();
  useFormKeyboardFocusVisibility({ scrollRootRef: panelRef, effectiveViewportBottom });
  const kbBand = keyboardOpen && visualViewportHeight > 0;
  const bandTop = Math.max(0, Math.round(visualViewportOffsetTop));
  const bandHeight = Math.round(visualViewportHeight);
  /** 마운트 = 열림 — Android 시스템 뒤로는 이 시트만 닫는다 (INAPP-07 오버레이 스택, SPL-05) */
  useOverlayHardwareBack(true, onClose);
  useRegisterOpenOverlay(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  /**
   * 열림 움직임 — 모든 위치(하단 시트·기기 하단·가운데)에 적용. 공용 오버레이(`DibayOverlayRoot`)와 같이
   * rAF 두 번: 시작 위치(아래 100%)를 한 번 그린 뒤 들어온다 — 한 번이면 시작 위치 없이 바로 그려져 움직임이 안 보인다.
   * (QR 시트가 아래→위로 올라오지 않던 결함, Owner 실기 2026-11-12)
   */
  useEffect(() => {
    if (!mounted) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [mounted]);

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
    ? `${MESSENGER_HOME_BOTTOM_SHEET_DEVICE_BOTTOM_CLASS} ${MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS}`
    : center
      ? "messenger-home-center-sheet-panel"
      : `${MESSENGER_HOME_BOTTOM_SHEET_PANEL_CLASS} ${MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS}`;
  const panelMotionClass =
    center ?
      entered ? "messenger-home-center-sheet-panel--entered" : "messenger-home-center-sheet-panel--entering"
    : entered ? "messenger-home-bottom-sheet-panel--entered" : "messenger-home-bottom-sheet-panel--entering";

  return createPortal(
    <div
      className={`fixed inset-0 ${MAIN_BOTTOM_NAV_SHEET_Z_CLASS}`}
      style={kbBand ? { top: bandTop, height: bandHeight, bottom: "auto" } : undefined}
      role="presentation"
      data-dibay-overlay="messenger-home-sheet"
      data-overlay-anchor={anchor}
      data-kb-band={kbBand ? "true" : undefined}
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
        ref={panelRef}
        data-keyboard-tap-dismiss="1"
        style={
          deviceBottom ?
            ({
              "--messenger-home-sheet-device-height": `${Math.min(1, Math.max(0.25, deviceHeightRatio)) * 100}dvh`,
            } as CSSProperties)
          : center && kbBand ?
            {
              top: bandTop + Math.round(bandHeight / 2),
              maxHeight: Math.max(1, Math.min(bandHeight - 32, 560)),
            }
          : undefined
        }
        className={`${center ? "fixed" : "absolute inset-x-0 w-full"} flex flex-col overflow-hidden border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] shadow-[var(--overlay-elevation-3)] ${center ? "rounded-[length:var(--overlay-radius-lg)]" : "rounded-t-[length:var(--overlay-radius-xl)] border-b-0"} ${panelAnchorClass} ${panelMotionClass} ${panelClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * S1 하단 시트 머리 (1단계 문서 §13-2 · U-5) — 손잡이 + 제목 왼쪽 + 오른쪽 X 아이콘.
 * 메신저 홈 시트는 모두 이 머리만 쓴다(글자 「닫기」·작은 ×·가운데 제목·제목 중복 금지).
 */
export function MessengerSheetHeaderBar({
  title,
  onClose,
  closeLabel,
  trailing,
}: {
  title: ReactNode;
  onClose: () => void;
  closeLabel: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="shrink-0 border-b border-[color:var(--overlay-border)] px-4 pt-2" data-cm-sheet-header-bar="">
      <div className="dibay-overlay-sheet__handle !mb-1" aria-hidden />
      <DibaySheetHeader title={title} onClose={onClose} closeLabel={closeLabel} trailing={trailing} />
    </div>
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
    <label
      className={`flex items-start justify-between gap-3 px-3 py-2 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className="min-w-0">
        <span
          className="block text-[length:var(--overlay-body-1-size)] font-medium leading-[1.4]"
          style={{ color: disabled ? "var(--overlay-text-secondary)" : "var(--overlay-text-primary)" }}
        >
          {title}
        </span>
        {description ? (
          <span
            className="mt-0.5 block text-[length:var(--overlay-body-2-size)] leading-[1.4]"
            style={{ color: "var(--overlay-text-secondary)" }}
          >
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-[color:var(--overlay-border)] accent-[color:var(--overlay-primary)] focus:ring-[color:var(--sm-color-primary-soft)]"
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
      className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors enabled:active:bg-[color:var(--overlay-secondary)] disabled:cursor-not-allowed"
    >
      <span className="min-w-0">
        <span
          className="block text-[length:var(--overlay-body-1-size)] font-medium leading-[1.4]"
          style={{ color: disabled ? "var(--overlay-text-secondary)" : "var(--overlay-text-primary)" }}
        >
          {title}
        </span>
        {description ? (
          <span
            className="mt-0.5 block text-[length:var(--overlay-body-2-size)] leading-[1.4]"
            style={{ color: "var(--overlay-text-secondary)" }}
          >
            {description}
          </span>
        ) : null}
      </span>
      <span
        className="shrink-0 text-[length:var(--overlay-body-2-size)] font-medium"
        style={{ color: disabled ? "var(--overlay-text-secondary)" : "var(--overlay-primary)" }}
      >
        {actionLabel}
      </span>
    </button>
  );
}
