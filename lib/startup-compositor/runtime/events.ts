/**
 * REBUILD 14 P2 — compositor lifecycle events (single semantic vocabulary).
 */

export const COMPOSITOR_EVENTS = [
  "ATTACH",
  "PAINTABLE",
  "FIRST_FRAME_COMMITTED",
  "OWNER_VISIBLE",
  "HOME_PRESENTATION_READY",
  "HANDOFF_REQUESTED",
  "HANDOFF_COMPLETE",
  "DETACH",
  "DESTROY",
  "FOREGROUND",
  "BACKGROUND",
] as const;

export type CompositorEvent = (typeof COMPOSITOR_EVENTS)[number];

export type CompositorSurfacePhase =
  | "IDLE"
  | "ATTACHED"
  | "PAINTABLE"
  | "FIRST_FRAME_COMMITTED"
  | "OWNER_VISIBLE"
  | "HOME_READY"
  | "HANDOFF"
  | "DONE"
  | "DESTROYED";

export type EventOwnershipRow = {
  readonly event: CompositorEvent;
  readonly producer: string;
  readonly consumer: string;
  readonly idempotent: boolean;
  readonly meaning: string;
};

/** Frozen event ownership for P2 (shared engine is semantic consumer/owner). */
export const COMPOSITOR_EVENT_OWNERSHIP: readonly EventOwnershipRow[] = [
  {
    event: "ATTACH",
    producer: "thin platform host",
    consumer: "StartupCompositorEngine",
    idempotent: true,
    meaning: "Surface mounted in root hierarchy (not product paint)",
  },
  {
    event: "PAINTABLE",
    producer: "thin host / future media bind",
    consumer: "StartupCompositorEngine",
    idempotent: true,
    meaning: "IR/bind ready for first frame (P2: structural only)",
  },
  {
    event: "FIRST_FRAME_COMMITTED",
    producer: "thin host paint commit primitive",
    consumer: "StartupCompositorEngine",
    idempotent: true,
    meaning: "GPU/compositor committed first frame (P2 unused in Production)",
  },
  {
    event: "OWNER_VISIBLE",
    producer: "platform reveal adapter",
    consumer: "StartupCompositorEngine",
    idempotent: true,
    meaning: "App-owned product pixels Owner-visible (P7)",
  },
  {
    event: "HOME_PRESENTATION_READY",
    producer: "ONE web→engine ingress (ingestHomePresentationReady)",
    consumer: "StartupCompositorEngine",
    idempotent: true,
    meaning: "Meaningful Home chrome ready for ownership transfer",
  },
  {
    event: "HANDOFF_REQUESTED",
    producer: "StartupCompositorEngine (internal)",
    consumer: "thin host yield",
    idempotent: true,
    meaning: "Begin yield of compositor ownership",
  },
  {
    event: "HANDOFF_COMPLETE",
    producer: "thin host after yield",
    consumer: "StartupCompositorEngine",
    idempotent: true,
    meaning: "Compositor no longer Owner-visible; Home owns",
  },
  {
    event: "DETACH",
    producer: "thin host",
    consumer: "StartupCompositorEngine",
    idempotent: true,
    meaning: "Surface removed after successful handoff or destroy",
  },
  {
    event: "DESTROY",
    producer: "root lifecycle",
    consumer: "StartupCompositorEngine",
    idempotent: true,
    meaning: "Tear down instance; late events ignored",
  },
  {
    event: "FOREGROUND",
    producer: "thin host lifecycle",
    consumer: "StartupCompositorEngine",
    idempotent: true,
    meaning: "Must not create duplicate compositor",
  },
  {
    event: "BACKGROUND",
    producer: "thin host lifecycle",
    consumer: "StartupCompositorEngine",
    idempotent: true,
    meaning: "Must not create duplicate compositor",
  },
] as const;
