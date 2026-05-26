"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sam } from "@/lib/ui/sam-component-classes";

/** standard: 하단 시트·배경 탭으로 닫음 | blocking: 화면 중앙·배경·Esc 로 닫지 않음(버튼만) */
export type MobileSheetInteractionMode = "standard" | "blocking";

export type MobileConfirmBottomSheetProps = {
  open: boolean;
  /** 배경 클릭·{t("common_cancel")} 버튼과 동일할 때 (`interactionMode="blocking"` 이면 배경 탭 {t("common_none")}) */
  onCancel: () => void;
  title: string;
  description?: string;
  cancelLabel: string;
  confirmLabel: string;
  /** 나가기·{t("common_delete")} 등 위험 동작 */
  confirmTone?: "danger" | "primary";
  onConfirm: () => void;
  /** 시트·다른 오버레이 위 */
  zIndexClass?: string;
  /** 접근성 라벨 */
  ariaLabel?: string;
  interactionMode?: MobileSheetInteractionMode;
};

/**
 * 모바일 웹(Facebook/메신저류) 스타일 하단 확인 시트 — 스티키 헤더·글쓰기 시트 위에 겹침.
 * `transform` 조상 밖에서 보이도록 `document.body` 포털.
 */
export function MobileConfirmBottomSheet({
  open,
  onCancel,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmTone = "danger",
  onConfirm,
  zIndexClass = "z-[60]",
  ariaLabel,
  interactionMode = "standard",
}: MobileConfirmBottomSheetProps) {
  const { t } = useI18n();
  const resolvedAriaLabel = ariaLabel ?? t("ui_sheet_confirm_aria");
  const [entered, setEntered] = useState(false);
  const blocking = interactionMode === "blocking";

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open || blocking) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onCancel, blocking]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const confirmClass =
    confirmTone === "primary"
      ? `${Sam.btn.primaryCombo} ${Sam.btn.block}`
      : `${Sam.btn.dangerCombo} ${Sam.btn.block}`;

  const node = blocking ? (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${zIndexClass}`}
      role="dialog"
      aria-modal
      aria-label={resolvedAriaLabel}
    >
      <div className="absolute inset-0 bg-[color:var(--dibay-dim)]" aria-hidden />
      <div
        className={`relative z-10 w-full max-w-sm rounded-[length:var(--ui-radius-rect)] border border-sam-border bg-sam-surface px-6 pb-6 pt-7 shadow-sam-elevated transition-[opacity,transform] duration-200 ease-out ${
          entered ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
        }`}
      >
        <h2 className="text-center text-[18px] font-semibold leading-snug tracking-[-0.01em] text-sam-fg">{title}</h2>
        {description ? (
          <p className="mt-2.5 px-0.5 text-center text-[15px] leading-relaxed text-sam-muted">{description}</p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className={`${Sam.btn.cancelCombo} ${Sam.btn.block} min-h-[48px]`}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button type="button" className={`${confirmClass} min-h-[48px]`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div
      className={`fixed inset-0 flex items-end justify-center ${zIndexClass}`}
      role="dialog"
      aria-modal
      aria-label={resolvedAriaLabel}
    >
      <button
        type="button"
        className="absolute inset-0 bg-[color:var(--dibay-dim)] transition-opacity duration-200"
        style={{ opacity: entered ? 1 : 0 }}
        onClick={onCancel}
        aria-label={t("ui_sheet_close_aria")}
      />
      <div
        className={`relative w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] border border-sam-border border-b-0 bg-sam-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-2 shadow-sam-elevated transition-transform duration-300 ease-[cubic-bezier(0.22,0.9,0.32,1)] ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-10 shrink-0 rounded-full bg-sam-border-soft" aria-hidden />

        <h2 className="text-center text-[17px] font-semibold leading-snug text-sam-fg">{title}</h2>
        {description ? (
          <p className="mt-2 px-1 text-center sam-text-body leading-relaxed text-sam-muted">{description}</p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            className={`${Sam.btn.cancelCombo} ${Sam.btn.block} min-h-[48px]`}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button type="button" className={`${confirmClass} min-h-[48px]`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

export type MobileDualActionBottomSheetProps = {
  open: boolean;
  /** `interactionMode="standard"` 일 때만 배경·Esc 에 사용 (blocking 이면 무시) */
  onClose: () => void;
  title: string;
  description?: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  /** 보조(왼쪽·위) / 주요(오른쪽·아래) 톤 */
  primaryTone?: "primary" | "secondary";
  zIndexClass?: string;
  ariaLabel?: string;
  interactionMode?: MobileSheetInteractionMode;
};

/** 이어쓰기/새로 작성 등 동급 두 선택 — 주 버튼은 시그니처 색 */
export function MobileDualActionBottomSheet({
  open,
  onClose,
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  primaryTone = "primary",
  zIndexClass = "z-[60]",
  ariaLabel,
  interactionMode = "standard",
}: MobileDualActionBottomSheetProps) {
  const { t } = useI18n();
  const resolvedAriaLabel = ariaLabel ?? t("ui_sheet_choice_aria");
  const [entered, setEntered] = useState(false);
  const blocking = interactionMode === "blocking";

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open || blocking) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose, blocking]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const primaryClass =
    primaryTone === "primary"
      ? `${Sam.btn.primaryCombo} ${Sam.btn.block}`
      : `${Sam.btn.secondaryCombo} ${Sam.btn.block}`;

  const actions = (
    <div className="mt-6 flex flex-col gap-3">
      <button
        type="button"
        className={`${Sam.btn.cancelCombo} ${Sam.btn.block} min-h-[48px]`}
        onClick={() => {
          onSecondary();
        }}
      >
        {secondaryLabel}
      </button>
      <button type="button" className={`${primaryClass} min-h-[48px]`} onClick={() => onPrimary()}>
        {primaryLabel}
      </button>
    </div>
  );

  const node = blocking ? (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${zIndexClass}`}
      role="dialog"
      aria-modal
      aria-label={resolvedAriaLabel}
    >
      <div className="absolute inset-0 bg-[color:var(--dibay-dim)]" aria-hidden />
      <div
        className={`relative z-10 w-full max-w-sm rounded-[length:var(--ui-radius-rect)] border border-sam-border bg-sam-surface px-6 pb-6 pt-7 shadow-sam-elevated transition-[opacity,transform] duration-200 ease-out ${
          entered ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
        }`}
      >
        <h2 className="text-center text-[18px] font-semibold leading-snug tracking-[-0.01em] text-sam-fg">{title}</h2>
        {description ? (
          <p className="mt-2.5 px-0.5 text-center text-[15px] leading-relaxed text-sam-muted">{description}</p>
        ) : null}
        {actions}
      </div>
    </div>
  ) : (
    <div
      className={`fixed inset-0 flex items-end justify-center ${zIndexClass}`}
      role="dialog"
      aria-modal
      aria-label={resolvedAriaLabel}
    >
      <button
        type="button"
        className="absolute inset-0 bg-[color:var(--dibay-dim)] transition-opacity duration-200"
        style={{ opacity: entered ? 1 : 0 }}
        onClick={onClose}
        aria-label={t("ui_sheet_close_aria")}
      />
      <div
        className={`relative w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] border border-sam-border border-b-0 bg-sam-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-2 shadow-sam-elevated transition-transform duration-300 ease-[cubic-bezier(0.22,0.9,0.32,1)] ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mb-3 mt-1 h-1 w-10 shrink-0 rounded-full bg-sam-border-soft" aria-hidden />

        <h2 className="text-center text-[17px] font-semibold leading-snug text-sam-fg">{title}</h2>
        {description ? (
          <p className="mt-2 px-1 text-center sam-text-body leading-relaxed text-sam-muted">{description}</p>
        ) : null}
        {actions}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
