/**
 * U1 — when the Android Play update dialogs may be shown.
 * Pure policy + one DOM reader. No global modal system: reuses the overlay back stack
 * (`lib/ui/overlay-back-stack.ts`), dialog roles in the DOM, the launch intro marker and the route.
 * Unsafe → the Host keeps the prompt pending and re-checks later; it never drops it.
 */
import { overlayBackStackDepth } from "@/lib/ui/overlay-back-stack";
import type { AndroidPlayUpdateInfo } from "@/lib/platform/android-play-in-app-update-policy";
import type {
  AndroidPlayUpdateAvailablePayload,
  AndroidPlayUpdateOrchestratorResult,
} from "@/lib/platform/android-play-in-app-update-orchestrator";

export type UpdatePromptSafetyInput = {
  pathname: string | null | undefined;
  /** OS Start / launch intro overlay still on screen. */
  introActive: boolean;
  /** Visible dialogs / sheets / banners that are not the update dialog itself. */
  foreignOverlayCount: number;
  textInputFocused: boolean;
  documentVisible: boolean;
  /** Native active call (Play info `callInProgress`). */
  callActive: boolean;
};

export type UpdatePromptSafety = { safe: true } | { safe: false; reason: string };

/**
 * Routes where the dialog must not appear or stay open: auth, admin, chat rooms / threads, calls,
 * checkout, write / edit / compose flows.
 */
export function isUpdatePromptSensitivePath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split(/[?#]/)[0].replace(/\/+$/, "");
  if (!p) return false;
  if (/^\/(login|signup|admin)(\/|$)/.test(p)) return true;
  if (/^\/auth(\/|$)/.test(p)) return true;
  if (/^\/community-messenger\/(rooms|calls|calls-v3|calls-v4)\//.test(p)) return true;
  if (/^\/community-messenger\/calls(\/|$)/.test(p)) return true;
  if (/^\/chats\/[^/]+/.test(p)) return true;
  // Every chat room / conversation thread surface (trade · community · store order · group · CS).
  if (/^\/group-chat\/[^/]+/.test(p)) return true;
  if (/^\/mypage\/trade\/chat\/[^/]+/.test(p)) return true;
  if (/^\/(mypage|philife)\/purchases\/[^/]+/.test(p)) return true;
  if (/^\/(orders\/store|mypage\/store-orders|my\/store-orders)\/[^/]+\/chat(\/|$)/.test(p)) return true;
  if (/^\/my\/business\/store-order-chat\/[^/]+/.test(p)) return true;
  if (/^\/(mypage\/inbox|mypage\/inquiries|notifications\/notes)\/[^/]+/.test(p)) return true;
  if (/^\/stores\/owner\/customer-care\/(messages|inquiries)\/[^/]+/.test(p)) return true;
  if (/^\/support\/cases\/[^/]+/.test(p)) return true;
  if (/^\/stores\/[^/]+\/checkout(\/|$)/.test(p)) return true;
  if (/(^|\/)(write|edit|new|compose)(\/|$)/.test(p)) return true;
  if (/^\/debug\/call-qa(\/|$)/.test(p)) return true;
  return false;
}

/** Before opening a pending update dialog. */
export function resolveUpdatePromptSafety(input: UpdatePromptSafetyInput): UpdatePromptSafety {
  if (!input.documentVisible) return { safe: false, reason: "background" };
  if (input.introActive) return { safe: false, reason: "intro" };
  if (input.callActive) return { safe: false, reason: "call" };
  if (isUpdatePromptSensitivePath(input.pathname)) return { safe: false, reason: "sensitive_route" };
  if (input.foreignOverlayCount > 0) return { safe: false, reason: "other_overlay" };
  if (input.textInputFocused) return { safe: false, reason: "text_input" };
  return { safe: true };
}

/**
 * While an update dialog is open: hide it (back to pending, no deferral) when a call,
 * an incoming-call banner / another dialog, or a sensitive route takes over.
 * Text focus is ignored — the dialog itself owns focus.
 */
export function shouldYieldOpenUpdatePrompt(input: UpdatePromptSafetyInput): boolean {
  if (input.callActive) return true;
  if (isUpdatePromptSensitivePath(input.pathname)) return true;
  return input.foreignOverlayCount > 0;
}

const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "email",
  "tel",
  "url",
  "password",
  "number",
]);

function isTextEntryElement(el: Element | null): boolean {
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = ((el as HTMLInputElement).type || "").toLowerCase();
    return TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

function isRenderedElement(el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    if (node.hasAttribute("hidden")) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    const style = node.ownerDocument?.defaultView?.getComputedStyle(node);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    node = node.parentElement;
  }
  return true;
}

/**
 * Reads the live DOM. `ownDialogsOpen` = update dialogs currently open (they are excluded).
 */
export function readUpdatePromptSafetyInput(args: {
  pathname: string | null | undefined;
  callActive: boolean;
  ownDialogsOpen: number;
  doc?: Document;
}): UpdatePromptSafetyInput {
  const doc = args.doc ?? (typeof document !== "undefined" ? document : undefined);
  if (!doc) {
    return {
      pathname: args.pathname,
      introActive: false,
      foreignOverlayCount: 0,
      textInputFocused: false,
      documentVisible: false,
      callActive: args.callActive,
    };
  }
  const dialogs = Array.from(
    doc.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')
  ).filter(isRenderedElement);
  const domForeign = Math.max(0, dialogs.length - args.ownDialogsOpen);
  let stackForeign = 0;
  try {
    stackForeign = Math.max(0, overlayBackStackDepth() - args.ownDialogsOpen);
  } catch {
    stackForeign = 0;
  }
  return {
    pathname: args.pathname,
    introActive: doc.querySelector("[data-launch-intro-overlay]") != null,
    foreignOverlayCount: Math.max(domForeign, stackForeign),
    textInputFocused: isTextEntryElement(doc.activeElement),
    documentVisible: doc.visibilityState !== "hidden",
    callActive: args.callActive,
  };
}

export type PendingUpdatePrompt =
  | { kind: "available"; payload: AndroidPlayUpdateAvailablePayload }
  | { kind: "install" };

export type PendingUpdatePromptResolution =
  | { action: "open_available"; payload: AndroidPlayUpdateAvailablePayload }
  | { action: "open_install" }
  | { action: "keep" }
  | { action: "drop" };

/**
 * A held prompt is re-validated against fresh Play info right before it opens —
 * never show an old prompt after the update was installed or the state changed.
 */
export function resolvePendingUpdatePrompt(args: {
  pending: PendingUpdatePrompt;
  info: AndroidPlayUpdateInfo;
  installReadyDismissed: boolean;
}): PendingUpdatePromptResolution {
  const { pending, info } = args;
  if (info.callInProgress === true) return { action: "keep" };
  if (info.installStatus === "DOWNLOADED") {
    return args.installReadyDismissed ? { action: "drop" } : { action: "open_install" };
  }
  if (pending.kind === "install") return { action: "drop" };
  if (info.updateAvailability !== "UPDATE_AVAILABLE" || info.flexibleAllowed !== true) {
    return { action: "drop" };
  }
  const heldCode = pending.payload.availableVersionCode;
  const freshCode = info.availableVersionCode;
  if (heldCode != null && freshCode != null && freshCode < heldCode) return { action: "drop" };
  return {
    action: "open_available",
    payload: {
      ...pending.payload,
      availableVersionCode: freshCode ?? heldCode,
      installedVersionCode: info.installedVersionCode ?? pending.payload.installedVersionCode,
      installedVersionName: info.installedVersionName ?? pending.payload.installedVersionName,
    },
  };
}

const CALL_BLOCK_REASONS = new Set(["call_in_progress", "ui_blocked", "downloaded_but_ui_blocked"]);

export type UpdateConfirmOutcome =
  | { kind: "close" }
  | { kind: "keep_open" }
  | { kind: "error"; message: "blocked_by_call" | "start_failed" | "install_failed" };

/** U3: "지금 업데이트" result → dialog. Failures stay visible; stale state closes. */
export function resolveUpdateStartConfirmOutcome(
  result: AndroidPlayUpdateOrchestratorResult
): UpdateConfirmOutcome {
  if (result.ran) return { kind: "close" };
  if (result.reason === "awaiting_install_confirmation") return { kind: "close" };
  if (result.reason === "update_not_available") return { kind: "close" };
  if (CALL_BLOCK_REASONS.has(result.reason)) return { kind: "error", message: "blocked_by_call" };
  return { kind: "error", message: "start_failed" };
}

/** U4: "지금 설치" result → dialog. Restart pending keeps it; stale download closes it. */
export function resolveInstallConfirmOutcome(
  result: AndroidPlayUpdateOrchestratorResult
): UpdateConfirmOutcome {
  if (result.ran) return { kind: "keep_open" };
  if (result.reason === "install_not_ready") return { kind: "close" };
  if (CALL_BLOCK_REASONS.has(result.reason)) return { kind: "error", message: "blocked_by_call" };
  return { kind: "error", message: "install_failed" };
}
