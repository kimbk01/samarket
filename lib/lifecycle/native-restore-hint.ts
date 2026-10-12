/**
 * Native → Web restore hint (Lifecycle SSOT §4–§5).
 * Injected at document-start as window.__DIBAY_NATIVE_RESTORE_HINT__.
 *
 * - Explicit restore|fresh|unknown → use as-is (new Native).
 * - Property absent → legacy Native (epoch only). Do NOT treat as UNKNOWN:
 *   that would Safe-Entry-block Intro for existing installed apps after Web deploy.
 * - Invalid string → unknown.
 */

export type NativeRestoreHint = "restore" | "fresh" | "unknown";

const HINT_RE = /^(restore|fresh|unknown)$/;

/** True when new Native injected the property (any valid value). */
export function hasNativeRestoreHintProperty(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof (window as unknown as { __DIBAY_NATIVE_RESTORE_HINT__?: unknown }).__DIBAY_NATIVE_RESTORE_HINT__ ===
    "string"
  );
}

export function readNativeRestoreHint(): NativeRestoreHint {
  if (typeof window === "undefined") return "unknown";
  const v = (window as unknown as { __DIBAY_NATIVE_RESTORE_HINT__?: unknown }).__DIBAY_NATIVE_RESTORE_HINT__;
  if (typeof v === "string" && HINT_RE.test(v)) return v as NativeRestoreHint;
  // Absent or invalid: callers must use hasNativeRestoreHintProperty() for legacy.
  return "unknown";
}
