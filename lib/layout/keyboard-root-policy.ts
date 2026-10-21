/**
 * Keyboard root policy — pure decisions for `KeyboardViewportRootProbe` (mounted ONCE in `app/layout.tsx`).
 *
 * - `html[data-kb-open]` : IME up AND a soft-keyboard field focused (same two gates as the BottomNav hide).
 *   CSS `--kb-safe-bottom` (app-shell.css) = 0 while open, `--safe-bottom` while closed. Only keyboard-linked
 *   bottom surfaces read it — headers, tabs and other safe-area consumers keep `--safe-bottom`.
 * - Android back release : keyboard closed → release the input focus so the next hardware back reaches the
 *   app (WebView keeps back while an input is focused — SM-M156S diagnosis). Chat routes keep their composer
 *   focus contract and are excluded.
 * - Tap-outside dismiss : opt-in surfaces only (`[data-keyboard-tap-dismiss="1"]` — forms, search, login,
 *   sheets). Never global, never chat composers. iOS only: Android WebView already moves focus off the
 *   input when a non-focusable area is tapped; iOS WebKit does not reliably do so for non-clickable areas
 *   and the form accessory bar (Done) is hidden natively.
 */

export const KEYBOARD_ROOT_OPEN_ATTR = "data-kb-open" as const;
export const KEYBOARD_TAP_DISMISS_SELECTOR = '[data-keyboard-tap-dismiss="1"]' as const;
/** Tap (not scroll) — finger travel at or below this is a tap. */
export const KEYBOARD_TAP_DISMISS_MAX_MOVE_PX = 10;

/** Messenger · trade/store chat · group chat — composer focus contract owns these routes. */
export const KEYBOARD_ROOT_CHAT_ROUTE_RE = /^\/(community-messenger|chats?|group-chat)(\/|$)/;

export function isKeyboardRootChatRoute(pathname: string | null | undefined): boolean {
  return KEYBOARD_ROOT_CHAT_ROUTE_RE.test(pathname ?? "");
}

type FocusLike = {
  tagName?: string;
  closest?: (selector: string) => unknown;
};

export function shouldReleaseInputFocusOnKeyboardClose(args: {
  platform: "android" | "ios" | null;
  pathname: string | null | undefined;
  wasOpen: boolean;
  open: boolean;
  /** Rotation / split-screen width change is not a keyboard close. */
  widthChanged: boolean;
  activeElement: FocusLike | null | undefined;
}): boolean {
  if (args.platform !== "android") return false;
  if (isKeyboardRootChatRoute(args.pathname)) return false;
  if (!args.wasOpen || args.open || args.widthChanged) return false;
  const el = args.activeElement;
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return false;
  if (typeof el.closest === "function" && el.closest("[data-messenger-header-stack]")) return false;
  return true;
}

/** Elements a tap on which must never dismiss the keyboard (they take focus or act). */
const TAP_DISMISS_KEEP_SELECTOR =
  "input,textarea,select,button,a,label,summary,[contenteditable],[role='button'],[role='link'],[role='option'],[role='menuitem'],[role='tab'],[role='checkbox'],[role='switch'],[tabindex]:not([tabindex='-1']),[data-keyboard-keep-focus='1']";

export function shouldDismissKeyboardOnTap(args: {
  platform: "android" | "ios" | null;
  pathname: string | null | undefined;
  /** Focused element is a soft-keyboard field. */
  editableFocused: boolean;
  movePx: number;
  target: FocusLike | null | undefined;
}): boolean {
  if (args.platform !== "ios") return false;
  if (!args.editableFocused) return false;
  if (isKeyboardRootChatRoute(args.pathname)) return false;
  if (!(args.movePx <= KEYBOARD_TAP_DISMISS_MAX_MOVE_PX)) return false;
  const t = args.target;
  if (!t || typeof t.closest !== "function") return false;
  if (!t.closest(KEYBOARD_TAP_DISMISS_SELECTOR)) return false;
  if (t.closest(TAP_DISMISS_KEEP_SELECTOR)) return false;
  return true;
}
