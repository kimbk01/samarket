/**
 * MAIN hub shell transition authority (BottomNav MAIN ↔ MAIN).
 *
 * CONTRACT:
 * - START = BottomNav MAIN intent (not pathname commit)
 * - ONE transform surface owns Header + Body
 * - pathname = destination confirm / settle / stale reject only
 * - DO NOT: COVER overlay · TRUE PUSH · frozen DOM · dual-panel Feed
 * - DO NOT: header/body separate animations
 */

import type { MainShellRoutePushAxis } from "@/components/route-transition/route-transition-config";
import { isMainTabKeepAliveHubPath } from "@/lib/layout/resolve-main-surface";

export type MainHubTransitionPhase = "armed" | "pending_exit" | "entering" | "settling" | "done";

export type MainHubTransitionSession = {
  generation: number;
  intentId: number;
  axis: MainShellRoutePushAxis;
  targetPath: string;
  startedAt: number;
  phase: MainHubTransitionPhase;
  /** performance.now when from-rtl first applied (transition_first_frame) */
  firstFrameAt: number | null;
  /** performance.now when matching pathname committed */
  pathnameCommitAt: number | null;
};

type Listener = () => void;
type SurfaceApplier = (session: MainHubTransitionSession) => void;

let generationSeq = 0;
let active: MainHubTransitionSession | null = null;
const listeners = new Set<Listener>();
let surfaceApplier: SurfaceApplier | null = null;

function normalizePath(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

function notify() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

/** AppRouteTransition registers the live push surface applier (sync intent path). */
export function registerMainHubTransitionSurfaceApplier(applier: SurfaceApplier | null): void {
  surfaceApplier = applier;
}

export function subscribeMainHubTransition(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function peekMainHubTransition(): MainHubTransitionSession | null {
  return active;
}

export function getMainHubTransitionGeneration(): number {
  return active?.generation ?? 0;
}

export function isMainHubBottomNavIntentSource(source: string | null | undefined): boolean {
  return source === "bottom-nav";
}

/** Hub↔hub BottomNav may arm intent-first MAIN transition. */
export function shouldArmMainHubIntentTransition(opts: {
  source: string | null | undefined;
  targetPath: string | null | undefined;
  fromPath?: string | null | undefined;
  axis?: MainShellRoutePushAxis | null;
  crossGroup?: boolean;
}): boolean {
  if (!isMainHubBottomNavIntentSource(opts.source)) return false;
  if (opts.crossGroup) return false;
  if (!opts.axis || (opts.axis !== "rtl" && opts.axis !== "ltr")) return false;
  const to = normalizePath(opts.targetPath);
  if (!isMainTabKeepAliveHubPath(to)) return false;
  if (opts.fromPath != null) {
    const from = normalizePath(opts.fromPath);
    if (from === to) return false;
    if (!isMainTabKeepAliveHubPath(from)) return false;
  }
  return true;
}

/**
 * Synchronous arm from BottomNav MAIN intent — START authority.
 * Bumps generation so stale pathname settles cannot finish a newer hop.
 * Applies pending_exit via registered surface applier in the same turn when possible.
 */
export function beginMainHubTransitionFromIntent(opts: {
  intentId: number;
  axis: MainShellRoutePushAxis;
  targetPath: string;
}): MainHubTransitionSession {
  generationSeq += 1;
  const session: MainHubTransitionSession = {
    generation: generationSeq,
    intentId: opts.intentId,
    axis: opts.axis,
    targetPath: normalizePath(opts.targetPath),
    startedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
    phase: "armed",
    firstFrameAt: null,
    pathnameCommitAt: null,
  };
  active = session;
  if (surfaceApplier) {
    try {
      surfaceApplier(session);
    } catch {
      /* ignore — layout effect / subscribe fallback */
    }
  }
  notify();
  return session;
}

export function markMainHubTransitionFirstFrame(generation: number, at = performance.now()): boolean {
  if (!active || active.generation !== generation) return false;
  if (active.firstFrameAt == null) active.firstFrameAt = at;
  if (active.phase === "armed") active.phase = "pending_exit";
  notify();
  return true;
}

export function markMainHubTransitionEntering(generation: number): boolean {
  if (!active || active.generation !== generation) return false;
  active.phase = "entering";
  notify();
  return true;
}

/** Pathname matched active target — confirm destination; do not restart motion. */
export function settleMainHubTransitionOnPathname(
  generation: number,
  pathname: string | null | undefined
): "settled" | "stale" | "mismatch" | "inactive" {
  if (!active || active.generation !== generation) return "stale";
  const current = normalizePath(pathname);
  const target = active.targetPath;
  const matched = current === target || current.startsWith(`${target}/`);
  if (!matched) return "mismatch";
  if (active.pathnameCommitAt == null) {
    active.pathnameCommitAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  }
  if (active.phase === "armed" || active.phase === "pending_exit") {
    active.phase = "entering";
  } else if (active.phase === "entering") {
    active.phase = "settling";
  }
  notify();
  return "settled";
}

export function finalizeMainHubTransition(generation: number): boolean {
  if (!active || active.generation !== generation) return false;
  active.phase = "done";
  active = null;
  notify();
  return true;
}

/** True when this generation still owns the surface (ignore stale completions). */
export function isMainHubTransitionGenerationActive(generation: number): boolean {
  return Boolean(active && active.generation === generation && active.phase !== "done");
}

export function clearMainHubTransitionForTests(): void {
  active = null;
  generationSeq = 0;
  surfaceApplier = null;
  notify();
}
