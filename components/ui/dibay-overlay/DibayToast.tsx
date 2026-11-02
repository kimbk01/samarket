"use client";

import type { CSSProperties, ReactNode } from "react";
import { DIBAY_TOAST_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

export type DibayToastTone = "default" | "success" | "error";

/**
 * 토스트 1종 겉모양 (팝업 SSOT §3-10 · B4). 표시·타이머·큐는 각 호스트가 그대로 갖고,
 * 시간은 `DIBAY_TOAST_MS` / `DIBAY_TOAST_ACTION_MS` 를 쓴다.
 * `stackClassName` — 위치를 바꿔야 하는 화면만 (예: 매장 하단 담기 바 위). 기본 = `.dibay-toast-stack`.
 */
export function DibayToast({
  message,
  tone = "default",
  action,
  stackClassName,
  stackStyle,
  role = "status",
  dataAttrs,
  onDismiss,
  dismissLabel,
}: {
  message: ReactNode;
  tone?: DibayToastTone;
  action?: { label: ReactNode; onPress: () => void } | null;
  stackClassName?: string;
  stackStyle?: CSSProperties;
  role?: "status" | "alert";
  dataAttrs?: Record<string, string>;
  /** 닫기(X) — 행동 버튼과 함께 둘 수 있다. `dismissLabel` = 화면 낭독기 이름 (필수 문구, 예: 「닫기」) */
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <div
      className={stackClassName ?? `${OverlayUi.toastStack} ${DIBAY_TOAST_Z_CLASS}`}
      style={stackStyle}
      {...dataAttrs}
    >
      <div role={role} aria-live={role === "alert" ? "assertive" : "polite"} className={OverlayUi.toast}>
        {tone !== "default" ? (
          <span
            aria-hidden
            className={`dibay-overlay-toast__icon dibay-overlay-toast__icon--${tone}`}
          >
            {tone === "success" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5m0 3.5v.01M12 3l9.5 17h-19L12 3z" />
              </svg>
            )}
          </span>
        ) : null}
        <span className="dibay-overlay-toast__text">{message}</span>
        {action ? (
          <button type="button" className="dibay-overlay-toast__action" onClick={action.onPress}>
            {action.label}
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            className="dibay-overlay-toast__dismiss"
            aria-label={dismissLabel}
            onClick={onDismiss}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} width="16" height="16" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
