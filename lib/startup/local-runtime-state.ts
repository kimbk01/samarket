/**
 * DIBAY Local Runtime Startup — shared state machine (Android / iOS identical).
 *
 * @see docs/dibay-local-runtime-startup-rearchitecture.md §4 / product cutover
 *
 * CONTRACT:
 * - One-way transitions only.
 * - Duplicate events are idempotent.
 * - Forbidden as normal path: REMOTE_DOCUMENT_LOADING, SECOND_INTRO,
 *   HANDOFF_COVER_AS_NORMAL_FLOW, BLANK, BLACK.
 * - No fixed-timeout transitions.
 */

export const LOCAL_RUNTIME_STATES = [
  "NATIVE_LAUNCH",
  "LOCAL_RUNTIME_LOADING",
  "LOCAL_RUNTIME_PAINTED",
  "INTRO_VISIBLE",
  "LOCAL_SHELL_READY",
  "SESSION_RESTORING",
  "APP_READY",
  "INTRO_REMOVED",
  "REMOTE_DATA_SYNC",
] as const;

export type LocalRuntimeState = (typeof LOCAL_RUNTIME_STATES)[number];

export const LOCAL_RUNTIME_FORBIDDEN_STATES = [
  "REMOTE_DOCUMENT_LOADING",
  "SECOND_INTRO",
  "HANDOFF_COVER_AS_NORMAL_FLOW",
  "BLANK",
  "BLACK",
] as const;

export type LocalRuntimeForbiddenState = (typeof LOCAL_RUNTIME_FORBIDDEN_STATES)[number];

const _STATE_INDEX: Record<LocalRuntimeState, number> = {
  NATIVE_LAUNCH: 0,
  LOCAL_RUNTIME_LOADING: 1,
  LOCAL_RUNTIME_PAINTED: 2,
  INTRO_VISIBLE: 3,
  LOCAL_SHELL_READY: 4,
  SESSION_RESTORING: 5,
  APP_READY: 6,
  INTRO_REMOVED: 7,
  REMOTE_DATA_SYNC: 8,
};
void _STATE_INDEX;

const ALLOWED_NEXT: Record<LocalRuntimeState, ReadonlySet<LocalRuntimeState>> = {
  NATIVE_LAUNCH: new Set(["NATIVE_LAUNCH", "LOCAL_RUNTIME_LOADING"]),
  LOCAL_RUNTIME_LOADING: new Set(["LOCAL_RUNTIME_LOADING", "LOCAL_RUNTIME_PAINTED"]),
  LOCAL_RUNTIME_PAINTED: new Set(["LOCAL_RUNTIME_PAINTED", "INTRO_VISIBLE"]),
  INTRO_VISIBLE: new Set(["INTRO_VISIBLE", "LOCAL_SHELL_READY"]),
  LOCAL_SHELL_READY: new Set(["LOCAL_SHELL_READY", "SESSION_RESTORING"]),
  SESSION_RESTORING: new Set(["SESSION_RESTORING", "APP_READY"]),
  APP_READY: new Set(["APP_READY", "INTRO_REMOVED"]),
  INTRO_REMOVED: new Set(["INTRO_REMOVED", "REMOTE_DATA_SYNC"]),
  REMOTE_DATA_SYNC: new Set(["REMOTE_DATA_SYNC"]),
};

export type LocalRuntimeTransitionResult =
  | { ok: true; from: LocalRuntimeState; to: LocalRuntimeState; advanced: boolean }
  | { ok: false; from: LocalRuntimeState; attempted: string; reason: "forbidden" | "rewind" | "unknown" };

export function isLocalRuntimeState(value: unknown): value is LocalRuntimeState {
  return typeof value === "string" && (LOCAL_RUNTIME_STATES as readonly string[]).includes(value);
}

export function isLocalRuntimeForbiddenState(value: unknown): value is LocalRuntimeForbiddenState {
  return typeof value === "string" && (LOCAL_RUNTIME_FORBIDDEN_STATES as readonly string[]).includes(value);
}

export function transitionLocalRuntimeState(
  current: LocalRuntimeState,
  next: string
): LocalRuntimeTransitionResult {
  if (isLocalRuntimeForbiddenState(next)) {
    return { ok: false, from: current, attempted: next, reason: "forbidden" };
  }
  if (!isLocalRuntimeState(next)) {
    return { ok: false, from: current, attempted: next, reason: "unknown" };
  }
  if (next === current) {
    return { ok: true, from: current, to: next, advanced: false };
  }
  if (!ALLOWED_NEXT[current].has(next)) {
    return { ok: false, from: current, attempted: next, reason: "rewind" };
  }
  return { ok: true, from: current, to: next, advanced: true };
}

export type LocalRuntimeAppReadyInput = {
  localRootMounted: boolean;
  localAppShellPaintReady: boolean;
  fatalStartupError: boolean;
};

export function resolveLocalRuntimeAppReady(input: LocalRuntimeAppReadyInput): boolean {
  return input.localRootMounted && input.localAppShellPaintReady && !input.fatalStartupError;
}

export class LocalRuntimeStateMachine {
  private state: LocalRuntimeState = "NATIVE_LAUNCH";

  getState(): LocalRuntimeState {
    return this.state;
  }

  transition(next: string): LocalRuntimeTransitionResult {
    const result = transitionLocalRuntimeState(this.state, next);
    if (result.ok && result.advanced) {
      this.state = result.to;
    }
    return result;
  }
}
