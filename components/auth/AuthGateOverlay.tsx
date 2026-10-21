"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

/** 하단 탭 z-[1200]·시트 z-[1300] 위 — 로그인 게이트 전용 */
export const AUTH_GATE_OVERLAY_Z_CLASS = "z-[1310]";

/**
 * safe-area 를 뺀 높이 (app/dibay-overlay.css `.dibay-overlay-dialog` 와 같은 규칙) · 상한 640px.
 * Tailwind arbitrary value — 공백은 `_`.
 */
export const AUTH_GATE_PANEL_MAX_H_CLASS =
  "!max-h-[min(calc(100dvh_-_2*var(--overlay-space-3,16px)_-_var(--safe-top,0px)_-_var(--safe-bottom,0px)),var(--auth-gate-keyboard-max-h,640px))]";

/** 키보드가 열렸을 때 visualViewport 높이 안에 패널을 유지하는 여백 */
const AUTH_GATE_KEYBOARD_GAP_PX = 16;

type AuthGateOverlayProps = {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  labelledBy?: string;
  describedBy?: string;
  /** Kept for callers; DibayOverlayRoot always exposes role=dialog. */
  role?: "dialog" | "alertdialog";
  /**
   * 닫을 수 없는 게이트(약관 동의 등) — Android 뒤로가기를 흡수해 화면에 머문다
   * (history 로 빠져 게이트 아래 화면으로 이동하지 않음). onClose 가 있으면 무시된다.
   */
  holdHardwareBack?: boolean;
};

const noop = () => {};

/**
 * Auth / onboarding center panel — Dibay Overlay SSOT backdrop + z.
 * Panel keeps auth-specific max size; OAuth flows unchanged.
 * - onClose 가 있으면 DibayOverlayRoot 가 Android 뒤로가기를 닫기로 등록한다.
 * - 키보드: Form keyboard SSOT(visualViewport) 로 패널 높이 제한 + 포커스 입력 노출.
 */
export function AuthGateOverlay({
  open,
  onClose,
  children,
  labelledBy,
  describedBy,
  holdHardwareBack = false,
}: AuthGateOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { keyboardOpen, visualViewportHeight, effectiveViewportBottom } = useFormKeyboardViewport({
    enabled: open,
  });
  useFormKeyboardFocusVisibility({
    enabled: open,
    scrollRootRef: panelRef,
    effectiveViewportBottom,
  });

  const holdBack = !onClose && holdHardwareBack;
  /** 키보드 열림 — visualViewport 높이를 상한 변수로 전달 (클래스의 safe-area 규칙과 min 결합) */
  const panelStyle: CSSProperties | undefined =
    keyboardOpen && visualViewportHeight > 0
      ? ({
          "--auth-gate-keyboard-max-h": `${Math.max(160, Math.round(visualViewportHeight - AUTH_GATE_KEYBOARD_GAP_PX * 2))}px`,
        } as CSSProperties)
      : undefined;

  return (
    <DibayOverlayRoot
      open={open}
      onClose={onClose ?? (holdBack ? noop : undefined)}
      dismissible={Boolean(onClose)}
      placement="center"
      zRole="nested"
      zIndexClass={AUTH_GATE_OVERLAY_Z_CLASS}
      labelledBy={labelledBy}
      describedBy={describedBy}
    >
      <div
        ref={panelRef}
        className={`${OverlayUi.dialogPanel} !max-w-md ${AUTH_GATE_PANEL_MAX_H_CLASS} overflow-y-auto overscroll-y-contain !rounded-[length:var(--overlay-radius-xl)] !px-5 !py-6`}
        style={panelStyle}
        data-dibay-overlay="auth-gate"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </DibayOverlayRoot>
  );
}
