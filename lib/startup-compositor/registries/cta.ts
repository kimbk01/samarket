/**
 * REBUILD 14 — CTA destination registry (no raw paths).
 */

export const CTA_INTERNAL_DESTINATIONS = [
  "community",
  "trade",
  "food",
  "chat",
  "my",
] as const;

export type CtaInternalDestination = (typeof CTA_INTERNAL_DESTINATIONS)[number];

export type CtaAction =
  | { readonly type: "NEXT_SCENE" }
  | { readonly type: "FINISH_INTRO" }
  | {
      readonly type: "INTERNAL_DESTINATION";
      readonly destination: CtaInternalDestination;
    };

export type CtaValidation =
  | { readonly ok: true; readonly value: CtaAction }
  | { readonly ok: false; readonly reason: string };

const DEST_SET = new Set<string>(CTA_INTERNAL_DESTINATIONS);

export function isCtaInternalDestination(
  raw: unknown,
): raw is CtaInternalDestination {
  return typeof raw === "string" && DEST_SET.has(raw);
}

export function parseCtaAction(raw: unknown): CtaValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "cta_action_missing" };
  }
  const o = raw as Record<string, unknown>;
  if (o.type === "NEXT_SCENE") return { ok: true, value: { type: "NEXT_SCENE" } };
  if (o.type === "FINISH_INTRO") {
    return { ok: true, value: { type: "FINISH_INTRO" } };
  }
  if (o.type === "INTERNAL_DESTINATION") {
    if (!isCtaInternalDestination(o.destination)) {
      return { ok: false, reason: "cta_destination_unsupported" };
    }
    return {
      ok: true,
      value: { type: "INTERNAL_DESTINATION", destination: o.destination },
    };
  }
  return { ok: false, reason: "cta_action_unsupported" };
}
