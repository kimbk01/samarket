/**
 * Main BottomNav — hide while the soft keyboard is open for a text field.
 *
 * Why: Android APK (`adjustResize` + Capacitor SystemBars IME padding +
 * `interactiveWidget: "resizes-content"`) shrinks the layout viewport, so the
 * `position:fixed; bottom:0` nav rides on top of the keyboard. iOS WKWebView
 * overlays the keyboard, so the nav is merely covered there.
 *
 * Contract:
 * - Visual only (same translate-hide class as scroll-hide). Never changes
 *   `occupiesClearance` / `BottomNavScrollChromeProvider.hidden`.
 * - BOTH gates are required: `keyboardOpen` (from `useFormKeyboardViewport`) AND a
 *   focused element that actually opens a soft keyboard. The viewport baseline can go
 *   stale (rotation, split-screen, window resize) and report "open" while no IME is
 *   up — the focus gate guarantees the nav returns on blur.
 */

/** Minimal element shape — duck-typed so the decision stays pure / Node-testable. */
export type BottomNavKeyboardFocusCandidate = {
  tagName?: string;
  type?: string;
  readOnly?: boolean;
  disabled?: boolean;
  isContentEditable?: boolean;
  /** Detached node (focused field unmounted without focusout) → not editable. */
  isConnected?: boolean;
  getAttribute?: (name: string) => string | null;
};

/**
 * `<input type>` values that do NOT open a soft text keyboard (toggles, buttons,
 * native pickers, file chooser). Unknown / missing types fall back to `text` per HTML.
 */
const NON_KEYBOARD_INPUT_TYPES: ReadonlySet<string> = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "file",
  "hidden",
  "image",
  "month",
  "radio",
  "range",
  "reset",
  "submit",
  "time",
  "week",
]);

function readAttr(el: BottomNavKeyboardFocusCandidate, name: string): string | null {
  if (typeof el.getAttribute !== "function") return null;
  try {
    return el.getAttribute(name);
  } catch {
    return null;
  }
}

function isContentEditableCandidate(el: BottomNavKeyboardFocusCandidate): boolean {
  if (el.isContentEditable === true) return true;
  const ce = readAttr(el, "contenteditable");
  if (ce == null) return false;
  const v = ce.trim().toLowerCase();
  return v === "" || v === "true" || v === "plaintext-only";
}

/** True when focusing `el` opens a soft text keyboard (input text-like, textarea, contenteditable). */
export function isSoftKeyboardEditableElement(
  el: BottomNavKeyboardFocusCandidate | null | undefined
): boolean {
  if (!el || typeof el !== "object") return false;
  if (el.disabled === true) return false;
  if (el.isConnected === false) return false;
  const inputMode = readAttr(el, "inputmode");
  if (inputMode != null && inputMode.trim().toLowerCase() === "none") return false;

  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tag === "TEXTAREA") return el.readOnly !== true;
  if (tag === "INPUT") {
    if (el.readOnly === true) return false;
    const rawType = typeof el.type === "string" ? el.type : readAttr(el, "type") ?? "";
    const type = rawType.trim().toLowerCase();
    return !NON_KEYBOARD_INPUT_TYPES.has(type);
  }
  return isContentEditableCandidate(el);
}

export function shouldHideBottomNavForKeyboard(args: {
  keyboardOpen: boolean;
  activeElement: BottomNavKeyboardFocusCandidate | null | undefined;
}): boolean {
  if (!args.keyboardOpen) return false;
  return isSoftKeyboardEditableElement(args.activeElement);
}

/**
 * - `visible`: nav shown.
 * - `hidden`: nav translate-hidden (IME overlays the page — iOS `visual_overlay`;
 *   nav sat behind the keyboard anyway, so nothing else moves).
 * - `hidden_layout_resized`: nav hidden AND the layout viewport shrank with the IME
 *   (Android `layout_resize`). Only here do sheets anchored above the nav drop their
 *   nav offset (`app-bottom-nav-shell--keyboard-resized`), so iOS geometry is unchanged.
 */
export type BottomNavKeyboardHideState = "visible" | "hidden" | "hidden_layout_resized";

export function resolveBottomNavKeyboardHideState(args: {
  keyboardOpen: boolean;
  activeElement: BottomNavKeyboardFocusCandidate | null | undefined;
  keyboardModel?: "layout_resize" | "visual_overlay" | "none" | null;
}): BottomNavKeyboardHideState {
  if (!shouldHideBottomNavForKeyboard(args)) return "visible";
  return args.keyboardModel === "layout_resize" ? "hidden_layout_resized" : "hidden";
}

/** Marker on the nav shell — CSS (`html:has(...)`) re-anchors above-nav sheets to the device bottom. */
export const BOTTOM_NAV_KEYBOARD_RESIZED_CLASS = "app-bottom-nav-shell--keyboard-resized";
