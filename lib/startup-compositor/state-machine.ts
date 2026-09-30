/**
 * REBUILD 14 — shared startup state-machine types (no host / no UI).
 * ss_absent_valid is intentionally absent.
 */

export const STARTUP_STATES = [
  "BOOT",
  "PACKAGE_RESOLVED",
  "START_VISIBLE",
  "INTRO_READY",
  "INTRO_VISIBLE",
  "HOME_READY",
  "HANDOFF",
  "DONE",
  "ERROR",
] as const;

export type StartupState = (typeof STARTUP_STATES)[number];

export type StartupEvent =
  | "platform_ready"
  | "envelope_ok"
  | "resolve_fail"
  | "ss_complete"
  | "intro_ready"
  | "intro_complete"
  | "intro_fail"
  | "home_ready"
  | "yield_done"
  | "fatal_owner_local_corruption"
  | "fatal_bootstrap";

export type StartupTransition = {
  readonly from: StartupState;
  readonly event: StartupEvent;
  readonly to: StartupState;
  readonly note?: string;
};

/** Normal + failure transitions (structural table). */
export const STARTUP_TRANSITIONS: readonly StartupTransition[] = [
  { from: "BOOT", event: "platform_ready", to: "PACKAGE_RESOLVED" },
  { from: "PACKAGE_RESOLVED", event: "envelope_ok", to: "START_VISIBLE" },
  {
    from: "PACKAGE_RESOLVED",
    event: "resolve_fail",
    to: "ERROR",
    note: "pre-START; no synthetic board",
  },
  {
    from: "PACKAGE_RESOLVED",
    event: "fatal_owner_local_corruption",
    to: "ERROR",
    note: "NOT bootstrap rollback",
  },
  {
    from: "PACKAGE_RESOLVED",
    event: "fatal_bootstrap",
    to: "ERROR",
    note: "unshippable seed defect",
  },
  {
    from: "START_VISIBLE",
    event: "ss_complete",
    to: "INTRO_VISIBLE",
    note: "guard: minVisible + introReady",
  },
  {
    from: "START_VISIBLE",
    event: "home_ready",
    to: "HANDOFF",
    note: "intro absent path after minVisible",
  },
  { from: "START_VISIBLE", event: "intro_fail", to: "START_VISIBLE", note: "KEEP SS frame; skip Intro" },
  { from: "INTRO_VISIBLE", event: "intro_complete", to: "HOME_READY" },
  { from: "HOME_READY", event: "home_ready", to: "HANDOFF" },
  { from: "HANDOFF", event: "yield_done", to: "DONE" },
  {
    from: "ERROR",
    event: "home_ready",
    to: "HANDOFF",
    note: "KEEP_EXISTING or pre-START OS until Home",
  },
] as const;

export function isStartupState(raw: unknown): raw is StartupState {
  return (
    typeof raw === "string" &&
    (STARTUP_STATES as readonly string[]).includes(raw)
  );
}

export function findTransitions(
  from: StartupState,
  event: StartupEvent,
): StartupTransition[] {
  return STARTUP_TRANSITIONS.filter((t) => t.from === from && t.event === event);
}
