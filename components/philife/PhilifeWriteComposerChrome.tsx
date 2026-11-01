"use client";

import type { ReactNode, RefCallback } from "react";
import { Check, ChevronRight, ImagePlus, Link2, Loader2, X } from "lucide-react";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";
import { FORM_INTERACTIVE_PRESS_CLASS } from "@/lib/ui/form-keyboard-viewport-contract";
import {
  PHILIFE_COMPOSER_HEADER_CLASS,
  PHILIFE_COMPOSER_HEADER_CTA_CLASS,
  PHILIFE_COMPOSER_HEADER_CTA_IDLE_CLASS,
  PHILIFE_COMPOSER_HEADER_CTA_READY_CLASS,
  PHILIFE_COMPOSER_HEADER_ICON_BTN_CLASS,
  PHILIFE_COMPOSER_HEADER_TITLE_CLASS,
  PHILIFE_COMPOSER_SHEET_ROW_CLASS,
  PHILIFE_COMPOSER_SHEET_ROW_ON_CLASS,
  PHILIFE_COMPOSER_TOOLBAR_CLASS,
  PHILIFE_COMPOSER_TOOLBAR_ROW_CLASS,
  PHILIFE_COMPOSER_TOOL_BTN_CLASS,
  PHILIFE_COMPOSER_TOOL_COUNT_CLASS,
  PHILIFE_COMPOSER_TOOL_ICON_CLASS,
  PHILIFE_COMPOSER_TOOL_SEPARATOR_CLASS,
  PHILIFE_COMPOSER_TOPIC_CHIP_CLASS,
  PHILIFE_COMPOSER_TOPIC_PLACEHOLDER_CLASS,
  PHILIFE_COMPOSER_TOPIC_ROW_CLASS,
} from "@/lib/ui/philife-write-composer-ui";

export const PHILIFE_WRITE_FORM_ID = "philife-neighborhood-write-form";

/** 작성기 헤더: ✕ · 제목 · CTA(등록/저장) — 화면 아래 CTA 줄 없음 */
export function PhilifeWriteComposerHeader({
  title,
  closeLabel,
  onClose,
  ctaLabel,
  ctaReady,
  ctaDisabled,
  busy,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  ctaLabel: string;
  /** 주제·제목·본문이 모두 있으면 true — false 여도 눌러서 빠진 칸 안내를 받는다 */
  ctaReady: boolean;
  /** 업로드 중·실패·등록 중 */
  ctaDisabled: boolean;
  busy: boolean;
}) {
  return (
    <div className="shrink-0 bg-sam-surface pt-[var(--safe-top)]">
    <header className={PHILIFE_COMPOSER_HEADER_CLASS} data-testid="philife-composer-header">
      <button type="button" onClick={onClose} aria-label={closeLabel} className={PHILIFE_COMPOSER_HEADER_ICON_BTN_CLASS}>
        <X className="h-6 w-6" aria-hidden />
      </button>
      <h2 className={PHILIFE_COMPOSER_HEADER_TITLE_CLASS}>{title}</h2>
      <button
        type="submit"
        form={PHILIFE_WRITE_FORM_ID}
        disabled={ctaDisabled || busy}
        aria-busy={busy || undefined}
        onPointerDown={(e) => {
          if (!(ctaDisabled || busy)) triggerInteractionFeedback("light", e);
        }}
        className={`${PHILIFE_COMPOSER_HEADER_CTA_CLASS} ${FORM_INTERACTIVE_PRESS_CLASS} ${
          ctaReady ? PHILIFE_COMPOSER_HEADER_CTA_READY_CLASS : PHILIFE_COMPOSER_HEADER_CTA_IDLE_CLASS
        }`}
        data-testid="philife-composer-cta"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-label={ctaLabel} /> : ctaLabel}
      </button>
    </header>
    </div>
  );
}

/** 주제 줄: 미선택 = 안내 글, 선택 = 칩 — 누르면 주제 시트 */
export function PhilifeWriteTopicRow({
  label,
  placeholder,
  ariaLabel,
  invalid,
  disabled,
  onOpen,
}: {
  label: string | null;
  placeholder: string;
  ariaLabel: string;
  invalid: boolean;
  disabled?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      data-invalid={invalid ? "true" : undefined}
      className={`${PHILIFE_COMPOSER_TOPIC_ROW_CLASS} ${invalid ? "!border-b-sam-danger" : ""}`}
      data-testid="philife-composer-topic"
    >
      {label ? (
        <span className={PHILIFE_COMPOSER_TOPIC_CHIP_CLASS}>{label}</span>
      ) : (
        <span className={PHILIFE_COMPOSER_TOPIC_PLACEHOLDER_CLASS}>{placeholder}</span>
      )}
      <ChevronRight className="h-5 w-5 shrink-0 text-sam-meta" aria-hidden />
    </button>
  );
}

/** 주제 시트 — 고르면 바로 닫힌다 */
export function PhilifeWriteTopicSheet({
  open,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  open: boolean;
  title: string;
  options: { slug: string; label: string }[];
  value: string;
  onSelect: (slug: string) => void;
  onClose: () => void;
}) {
  return (
    <DibayBottomSheet open={open} onClose={onClose} title={title} zIndexClass={MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS}>
      <ul role="listbox" aria-label={title} className="-mx-1" data-testid="philife-composer-topic-sheet">
        {options.map((o) => {
          const on = o.slug === value;
          return (
            <li key={o.slug}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onSelect(o.slug)}
                className={`${PHILIFE_COMPOSER_SHEET_ROW_CLASS} ${on ? PHILIFE_COMPOSER_SHEET_ROW_ON_CLASS : ""}`}
              >
                <span className="min-w-0 truncate">{o.label}</span>
                {on ? <Check className="h-5 w-5 shrink-0" aria-hidden /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </DibayBottomSheet>
  );
}

/**
 * 아래 도구줄 — 키보드 바로 위. 사진(지금 아이콘 + n/10) · 링크 · 구분선 · 서식 단추 자리.
 * 아래 여백 = Form 키보드 SSOT `effectiveBottomInset` 한 번만.
 */
export function PhilifeWriteComposerToolbar({
  ariaLabel,
  photoLabel,
  photoCount,
  photoMax,
  photoBusy,
  onPhoto,
  linkLabel,
  onLink,
  formatHostRef,
  children,
}: {
  ariaLabel: string;
  photoLabel: string;
  photoCount: number;
  photoMax: number;
  photoBusy: boolean;
  onPhoto: () => void;
  /** 없으면 링크 단추를 그리지 않는다(기존 편집기) */
  linkLabel?: string;
  onLink?: () => void;
  /** 편집기 서식 단추가 들어올 자리 */
  formatHostRef?: RefCallback<HTMLDivElement>;
  children?: ReactNode;
}) {
  const { effectiveBottomInset, keyboardOpen } = useFormKeyboardViewport();
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      data-form-keyboard-footer="1"
      data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      className={PHILIFE_COMPOSER_TOOLBAR_CLASS}
      style={{ paddingBottom: `${effectiveBottomInset}px` }}
      data-testid="philife-composer-toolbar"
    >
      <div className={PHILIFE_COMPOSER_TOOLBAR_ROW_CLASS}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onPhoto}
          disabled={photoBusy || photoCount >= photoMax}
          aria-label={photoLabel}
          className={PHILIFE_COMPOSER_TOOL_BTN_CLASS}
        >
          {photoBusy ? (
            <Loader2 className={`${PHILIFE_COMPOSER_TOOL_ICON_CLASS} animate-spin`} aria-hidden />
          ) : (
            <ImagePlus className={PHILIFE_COMPOSER_TOOL_ICON_CLASS} aria-hidden />
          )}
          <span className={PHILIFE_COMPOSER_TOOL_COUNT_CLASS}>
            {photoCount}/{photoMax}
          </span>
        </button>
        {onLink && linkLabel ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onLink}
            aria-label={linkLabel}
            className={PHILIFE_COMPOSER_TOOL_BTN_CLASS}
          >
            <Link2 className={PHILIFE_COMPOSER_TOOL_ICON_CLASS} aria-hidden />
          </button>
        ) : null}
        {formatHostRef ? (
          <>
            <span className={PHILIFE_COMPOSER_TOOL_SEPARATOR_CLASS} aria-hidden />
            <div ref={formatHostRef} className="flex shrink-0 items-center" />
          </>
        ) : null}
        {children}
      </div>
    </div>
  );
}
