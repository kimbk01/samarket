import type { MainShellRoutePushAxis } from "@/components/route-transition/route-transition-config";
import { MAIN_SHELL_ROUTE_TRANSITION_MS } from "@/components/route-transition/route-transition-config";

export type MainShellPushSession = {
  axis: MainShellRoutePushAxis;
  fromPath: string;
  toPath: string;
  /** enter — 새 셸 mount 후 진입 애니메이션 */
  phase: "enter";
  at: number;
};

const STORAGE_KEY = "sam.mainShellPush.v1";
const MAX_AGE_MS = 4000;

/**
 * CONTRACT — `(stores)`↔`(main)` remount 시 push 연속성.
 * DO NOT: cross-group 에서 `AppRouteTransition` dual-panel 만으로 처리(Provider remount).
 * exit: `[data-main-shell-push-surface]` → session enter → mount `consumeMainShellPushEnterSession`.
 */

function normalizePath(path: string | null | undefined): string {
  return (path ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

export function pathFromHref(href: string): string {
  const raw = href.trim();
  const q = raw.indexOf("?");
  return normalizePath(q >= 0 ? raw.slice(0, q) : raw);
}

/** `(stores)` 허브 vs `(main)` — Provider·push surface remount 경계 */
export function isCrossMainShellRouteGroup(
  fromPath: string | null | undefined,
  toPath: string | null | undefined
): boolean {
  const from = normalizePath(fromPath);
  const to = normalizePath(toPath);
  const fromStoresHub =
    from === "/stores" || from.startsWith("/stores/browse") || from.startsWith("/stores/search");
  const toStoresHub =
    to === "/stores" || to.startsWith("/stores/browse") || to.startsWith("/stores/search");
  return fromStoresHub !== toStoresHub;
}

export function armMainShellPushEnterSession(
  axis: MainShellRoutePushAxis,
  fromPath: string,
  toPath: string
): void {
  if (typeof window === "undefined") return;
  const payload: MainShellPushSession = {
    axis,
    fromPath: normalizePath(fromPath),
    toPath: normalizePath(toPath),
    phase: "enter",
    at: Date.now(),
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function consumeMainShellPushEnterSession(
  pathname: string | null | undefined
): MainShellPushSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as MainShellPushSession;
    if (!parsed?.axis || parsed.phase !== "enter") return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    const current = normalizePath(pathname);
    const expected = normalizePath(parsed.toPath);
    if (current !== expected && !current.startsWith(`${expected}/`)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function mainShellPushExitClassForAxis(axis: MainShellRoutePushAxis): string {
  return axis === "ltr" ? "main-shell-push-surface-exit-ltr" : "main-shell-push-surface-exit-rtl";
}

export function mainShellPushEnterClassForAxis(axis: MainShellRoutePushAxis): string {
  return axis === "ltr" ? "main-shell-push-surface-enter-ltr" : "main-shell-push-surface-enter-rtl";
}

export function mainShellPushFromClassForAxis(axis: MainShellRoutePushAxis): string {
  return axis === "ltr" ? "main-shell-push-surface-from-ltr" : "main-shell-push-surface-from-rtl";
}

export async function runMainShellPushExitBeforeNavigate(
  axis: MainShellRoutePushAxis,
  fromPath: string,
  toPath: string
): Promise<void> {
  if (typeof document === "undefined") return;
  const surface = document.querySelector<HTMLElement>("[data-main-shell-push-surface]");
  if (!surface) {
    armMainShellPushEnterSession(axis, fromPath, toPath);
    return;
  }

  const exitClass = mainShellPushExitClassForAxis(axis);
  surface.classList.remove(
    "main-shell-push-surface-enter-ltr",
    "main-shell-push-surface-enter-rtl",
    "main-shell-push-surface-exit-ltr",
    "main-shell-push-surface-exit-rtl"
  );
  void surface.offsetWidth;
  surface.classList.add(exitClass);

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      surface.classList.remove(exitClass);
      resolve();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== surface || e.propertyName !== "transform") return;
      surface.removeEventListener("transitionend", onEnd);
      finish();
    };
    surface.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, MAIN_SHELL_ROUTE_TRANSITION_MS + 48);
  });

  armMainShellPushEnterSession(axis, fromPath, toPath);
}
