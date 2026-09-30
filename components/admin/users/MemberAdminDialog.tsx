"use client";

/**
 * Member Admin Dialog SSOT (P1).
 * Header(title/description/X≥44) · Body · Footer(Cancel + Primary/Danger).
 * Dirty close / danger backdrop / pending / failure retention / success focus return.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";
import {
  MEMBER_ADMIN_DIALOG_CLOSE_HIT_MIN_PX,
  memberAdminBackdropDismissible,
  memberAdminDirtyCloseCopy,
  resolveMemberAdminAfterMutation,
  resolveMemberAdminDismiss,
  resolveMemberAdminMutationUi,
  type MemberAdminCloseIntent,
  type MemberAdminDialogTone,
} from "@/lib/admin-users/member-admin-dialog-contract";

export type MemberAdminDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  tone?: MemberAdminDialogTone;
  /** Form/body has unsaved edits. */
  dirty?: boolean;
  /** Mutation in flight — blocks close + double submit. */
  pending?: boolean;
  /** Human-readable error; dialog stays open when set. */
  errorText?: string | null;
  cancelLabel?: string;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onCancel: () => void;
  onPrimary: () => void;
  /** Called only after confirmed close (clean, or dirty discard confirmed). */
  onClosed?: () => void;
};

export function MemberAdminDialog({
  open,
  title,
  description,
  children,
  tone = "default",
  dirty = false,
  pending = false,
  errorText = null,
  cancelLabel = MEMBER_ADMIN_COPY.cancel,
  primaryLabel,
  primaryDisabled = false,
  onCancel,
  onPrimary,
  onClosed,
}: MemberAdminDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const errorId = useId();
  const [mounted, setMounted] = useState(false);
  const [dirtyConfirmOpen, setDirtyConfirmOpen] = useState(false);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const firstFieldRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setDirtyConfirmOpen(false);
      return;
    }
    previouslyFocused.current =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    const t = window.setTimeout(() => {
      const root = firstFieldRef.current;
      if (!root) return;
      const focusable = root.querySelector<HTMLElement>(
        "input, textarea, select, button:not([data-member-admin-dialog-close='1'])",
      );
      focusable?.focus?.();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const mutationUi = resolveMemberAdminMutationUi({ pending, primaryEnabled: !primaryDisabled });
  const backdropOk = memberAdminBackdropDismissible({ pending, tone });

  const requestClose = useCallback(
    (intent: MemberAdminCloseIntent) => {
      const decision = resolveMemberAdminDismiss({ intent, dirty, pending, tone });
      if (decision.kind === "block") return;
      if (decision.kind === "confirm_dirty") {
        setDirtyConfirmOpen(true);
        return;
      }
      onCancel();
      onClosed?.();
    },
    [dirty, pending, tone, onCancel, onClosed],
  );

  useEffect(() => {
    if (!open || pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (dirtyConfirmOpen) {
        setDirtyConfirmOpen(false);
        return;
      }
      requestClose("esc");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, dirtyConfirmOpen, requestClose]);

  if (!open || !mounted || typeof document === "undefined" || !document.body) return null;

  const dirtyCopy = memberAdminDirtyCloseCopy();
  const closePx = MEMBER_ADMIN_DIALOG_CLOSE_HIT_MIN_PX;

  return createPortal(
    <div
      className={`${OverlayUi.root} dibay-overlay-root--center`}
      role="presentation"
      data-member-admin-dialog="1"
      data-tone={tone}
      data-pending={pending ? "1" : "0"}
      data-dirty={dirty ? "1" : "0"}
    >
      {backdropOk ? (
        <button
          type="button"
          className={OverlayUi.backdrop}
          aria-label="닫기"
          data-member-admin-dialog-backdrop="1"
          onClick={() => requestClose("backdrop")}
        />
      ) : (
        <div className={OverlayUi.backdrop} aria-hidden data-member-admin-dialog-backdrop="blocked" />
      )}
      <div className="relative z-[1] flex w-full max-w-full items-center justify-center">
        <div
          className={OverlayUi.dialogPanel}
          data-dibay-dialog-panel="1"
          data-member-admin-dialog-panel="1"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description || errorText ? bodyId : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex items-start gap-2 pr-1">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className={OverlayUi.title}>
                {title}
              </h2>
              {description ? (
                <p id={bodyId} className={OverlayUi.body}>
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              data-member-admin-dialog-close="1"
              aria-label="닫기"
              disabled={pending}
              onClick={() => requestClose("x")}
              className="inline-flex shrink-0 items-center justify-center rounded-ui-rect text-[color:var(--overlay-fg)] disabled:opacity-40"
              style={{ minWidth: closePx, minHeight: closePx, width: closePx, height: closePx }}
            >
              <span aria-hidden className="text-xl leading-none">
                ×
              </span>
            </button>
          </div>

          <div ref={firstFieldRef} className={`${OverlayUi.dialogScroll} mt-2`} data-member-admin-dialog-body="1">
            {children}
            {errorText ? (
              <p
                id={errorId}
                role="alert"
                data-member-admin-dialog-error="1"
                className="mt-3 text-sm text-[color:var(--overlay-danger,#E53935)]"
              >
                {errorText}
              </p>
            ) : null}
          </div>

          <div className={`${OverlayUi.actionsRow} mt-4`} data-member-admin-dialog-footer="1">
            <DibayOverlayButton
              roleTone="secondary"
              disabled={mutationUi.cancelDisabled}
              data-member-admin-dialog-cancel="1"
              onClick={() => requestClose("cancel")}
            >
              {cancelLabel}
            </DibayOverlayButton>
            <DibayOverlayButton
              roleTone={tone === "danger" ? "destructive" : "primary"}
              disabled={mutationUi.primaryDisabled}
              loading={mutationUi.showLoading}
              data-member-admin-dialog-primary="1"
              onClick={() => {
                if (mutationUi.primaryDisabled) return;
                onPrimary();
              }}
            >
              {primaryLabel}
            </DibayOverlayButton>
          </div>
        </div>
      </div>

      {dirtyConfirmOpen ? (
        <div
          className="absolute inset-0 z-[2] flex items-center justify-center bg-black/30 p-4"
          data-member-admin-dirty-confirm="1"
          role="presentation"
        >
          <div
            className={OverlayUi.dialogPanel}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${titleId}-dirty`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={`${titleId}-dirty`} className={OverlayUi.title}>
              {dirtyCopy.title}
            </h2>
            <p className={OverlayUi.body}>{dirtyCopy.description}</p>
            <div className={`${OverlayUi.actionsRow} mt-4`}>
              <DibayOverlayButton
                roleTone="secondary"
                data-member-admin-dirty-stay="1"
                onClick={() => setDirtyConfirmOpen(false)}
              >
                {dirtyCopy.stayLabel}
              </DibayOverlayButton>
              <DibayOverlayButton
                roleTone="destructive"
                data-member-admin-dirty-discard="1"
                onClick={() => {
                  setDirtyConfirmOpen(false);
                  onCancel();
                  onClosed?.();
                }}
              >
                {dirtyCopy.discardLabel}
              </DibayOverlayButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/** Helper for consumers: close only after confirmed mutation success. */
export function memberAdminDialogShouldCloseAfterMutation(
  outcome: "success" | "failure",
): boolean {
  return resolveMemberAdminAfterMutation(outcome).kind === "close_and_return_focus";
}
