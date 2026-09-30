/**
 * Member Admin Dialog SSOT — pure contract (P1).
 * UI components must consume these decisions; do not re-encode per screen.
 */

import { MEMBER_ADMIN_COPY } from "@/lib/admin-users/member-admin-copy-ssot";

export const MEMBER_ADMIN_DIALOG_CLOSE_HIT_MIN_PX = 44 as const;

export type MemberAdminDialogTone = "default" | "danger";

export type MemberAdminCloseIntent = "x" | "cancel" | "esc" | "backdrop";

export type MemberAdminDirtyCloseCopy = {
  title: string;
  description: string;
  stayLabel: string;
  discardLabel: string;
};

export type MemberAdminDismissDecision =
  | { kind: "allow_close" }
  | { kind: "block"; reason: "pending" | "danger_backdrop" }
  | { kind: "confirm_dirty"; copy: MemberAdminDirtyCloseCopy };

export function memberAdminDirtyCloseCopy(): MemberAdminDirtyCloseCopy {
  return {
    title: MEMBER_ADMIN_COPY.dirty_close_title,
    description: MEMBER_ADMIN_COPY.dirty_close_description,
    stayLabel: MEMBER_ADMIN_COPY.continue_editing,
    discardLabel: MEMBER_ADMIN_COPY.discard_changes,
  };
}

/**
 * Decide whether a close intent may dismiss the dialog.
 * - pending mutation: never close
 * - danger + backdrop: never close (accidental)
 * - dirty + X/Cancel/ESC: confirm discard
 * - dirty + backdrop on default: confirm discard
 * - clean: allow
 */
export function resolveMemberAdminDismiss(input: {
  intent: MemberAdminCloseIntent;
  dirty: boolean;
  pending: boolean;
  tone: MemberAdminDialogTone;
}): MemberAdminDismissDecision {
  if (input.pending) {
    return { kind: "block", reason: "pending" };
  }
  if (input.tone === "danger" && input.intent === "backdrop") {
    return { kind: "block", reason: "danger_backdrop" };
  }
  if (input.dirty && (input.intent === "x" || input.intent === "cancel" || input.intent === "esc" || input.intent === "backdrop")) {
    return { kind: "confirm_dirty", copy: memberAdminDirtyCloseCopy() };
  }
  return { kind: "allow_close" };
}

/** Backdrop click is wired only when dismissible by contract. */
export function memberAdminBackdropDismissible(input: {
  pending: boolean;
  tone: MemberAdminDialogTone;
}): boolean {
  if (input.pending) return false;
  if (input.tone === "danger") return false;
  return true;
}

/** ESC is listened when not pending (dirty handled via confirm path). */
export function memberAdminEscDismissible(input: { pending: boolean }): boolean {
  return !input.pending;
}

export type MemberAdminMutationUiState = {
  primaryDisabled: boolean;
  cancelDisabled: boolean;
  showLoading: boolean;
  mayCloseEarly: boolean;
};

export function resolveMemberAdminMutationUi(input: {
  pending: boolean;
  primaryEnabled?: boolean;
}): MemberAdminMutationUiState {
  const pending = Boolean(input.pending);
  const primaryEnabled = input.primaryEnabled !== false;
  return {
    primaryDisabled: pending || !primaryEnabled,
    cancelDisabled: pending,
    showLoading: pending,
    mayCloseEarly: !pending,
  };
}

export type MemberAdminMutationOutcome = "success" | "failure";

export type MemberAdminSuccessCloseDecision =
  | { kind: "close_and_return_focus" }
  | { kind: "keep_open"; reason: "mutation_not_confirmed" | "failure_retain" };

export function resolveMemberAdminAfterMutation(outcome: MemberAdminMutationOutcome): MemberAdminSuccessCloseDecision {
  if (outcome === "success") return { kind: "close_and_return_focus" };
  return { kind: "keep_open", reason: "failure_retain" };
}

export function memberAdminCloseHitTargetOk(widthPx: number, heightPx: number): boolean {
  return widthPx >= MEMBER_ADMIN_DIALOG_CLOSE_HIT_MIN_PX && heightPx >= MEMBER_ADMIN_DIALOG_CLOSE_HIT_MIN_PX;
}
