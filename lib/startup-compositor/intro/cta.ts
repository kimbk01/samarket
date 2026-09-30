/**
 * REBUILD 14 P4 — CTA semantic actions → engine intents (no Production routing).
 */

import {
  CTA_INTERNAL_DESTINATIONS,
  isCtaInternalDestination,
  type CtaInternalDestination,
} from "@/lib/startup-compositor/registries/cta";

export type IntroCtaActionKind = "NEXT" | "FINISH" | "INTERNAL_DESTINATION";

export type IntroCtaIntent =
  | { readonly kind: "NEXT"; readonly sceneIndex: number }
  | { readonly kind: "FINISH" }
  | {
      readonly kind: "INTERNAL_DESTINATION";
      readonly destination: CtaInternalDestination;
    };

export type CtaDispatchResult =
  | { readonly ok: true; readonly intent: IntroCtaIntent; readonly applied: boolean }
  | { readonly ok: false; readonly reason: string };

/**
 * Canonical document action types → P4 intent kinds.
 * NEXT_SCENE → NEXT, FINISH_INTRO → FINISH.
 */
export function mapDocumentCtaAction(action: {
  readonly type: string;
  readonly destination?: string;
}): CtaDispatchResult {
  if (action.type === "NEXT_SCENE" || action.type === "NEXT") {
    return {
      ok: true,
      intent: { kind: "NEXT", sceneIndex: -1 },
      applied: false,
    };
  }
  if (action.type === "FINISH_INTRO" || action.type === "FINISH") {
    return { ok: true, intent: { kind: "FINISH" }, applied: false };
  }
  if (action.type === "INTERNAL_DESTINATION") {
    const dest = action.destination;
    if (typeof dest !== "string" || !isCtaInternalDestination(dest)) {
      return { ok: false, reason: "unknown_destination" };
    }
    return {
      ok: true,
      intent: { kind: "INTERNAL_DESTINATION", destination: dest },
      applied: false,
    };
  }
  if (
    typeof action.type === "string" &&
    (action.type.startsWith("http") ||
      action.type.includes("/") ||
      action.type.includes("://"))
  ) {
    return { ok: false, reason: "raw_url_rejected" };
  }
  return { ok: false, reason: "invalid_cta_action" };
}

export function rejectRawUrlDestination(raw: unknown): boolean {
  if (typeof raw !== "string") return true;
  const s = raw.trim();
  if (!s) return true;
  if (s.includes("://") || s.startsWith("/") || s.includes(".")) {
    return true;
  }
  return !isCtaInternalDestination(s);
}

export const CTA_INTERNAL_DESTINATION_REGISTRY = CTA_INTERNAL_DESTINATIONS;
export { isCtaInternalDestination as isCtaInternalDestinationKey };

/**
 * NEXT / FINISH / INTERNAL idempotency gate — one action → one transition.
 */
export class IntroCtaActionGate {
  private lastActionToken: string | null = null;
  private sceneIndex = 0;
  private sceneCount = 0;
  private completionIntent = false;
  private stagedDestination: CtaInternalDestination | null = null;

  bind(sceneCount: number, sceneIndex = 0): void {
    this.sceneCount = Math.max(0, sceneCount);
    this.sceneIndex = Math.max(0, Math.min(sceneIndex, Math.max(0, this.sceneCount - 1)));
    this.lastActionToken = null;
    this.completionIntent = false;
    this.stagedDestination = null;
  }

  getSceneIndex(): number {
    return this.sceneIndex;
  }

  hasCompletionIntent(): boolean {
    return this.completionIntent;
  }

  getStagedDestination(): CtaInternalDestination | null {
    return this.stagedDestination;
  }

  /**
   * @param actionToken Stable idempotency key (e.g. elementId + intent + sceneIndex).
   */
  dispatch(
    intent: IntroCtaIntent,
    actionToken: string,
  ): CtaDispatchResult {
    if (this.lastActionToken === actionToken) {
      return { ok: true, intent, applied: false };
    }

    if (intent.kind === "NEXT") {
      if (this.sceneCount <= 0) {
        return { ok: false, reason: "no_scenes" };
      }
      if (this.sceneIndex >= this.sceneCount - 1) {
        // Last scene NEXT → completion intent (canonical: finish Intro).
        this.completionIntent = true;
        this.lastActionToken = actionToken;
        return {
          ok: true,
          intent: { kind: "FINISH" },
          applied: true,
        };
      }
      this.sceneIndex += 1;
      this.lastActionToken = actionToken;
      return {
        ok: true,
        intent: { kind: "NEXT", sceneIndex: this.sceneIndex },
        applied: true,
      };
    }

    if (intent.kind === "FINISH") {
      this.completionIntent = true;
      this.lastActionToken = actionToken;
      return { ok: true, intent, applied: true };
    }

    // INTERNAL_DESTINATION — stage intent; wait HOME_READY → HANDOFF (routing later).
    this.stagedDestination = intent.destination;
    this.completionIntent = true;
    this.lastActionToken = actionToken;
    return { ok: true, intent, applied: true };
  }
}
