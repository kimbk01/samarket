"use client";

/**
 * ARCH B — Delivery presentation instrumentation (dev evidence only).
 * Does not change product UX.
 */

export type DeliveryPresentationSurfaceKind = "browse" | "store";

type MountRecord = {
  kind: DeliveryPresentationSurfaceKind;
  instanceId: string;
  at: number;
};

const mounts: MountRecord[] = [];
const unmounts: MountRecord[] = [];
const events: { name: string; at: number; detail?: Record<string, unknown> }[] = [];

let browseSeq = 0;
let storeSeq = 0;

export function nextDeliveryBrowseInstanceId(): string {
  browseSeq += 1;
  return `browse-${browseSeq}`;
}

export function nextDeliveryStoreInstanceId(): string {
  storeSeq += 1;
  return `store-${storeSeq}`;
}

export function deliveryPresentationMarkMount(
  kind: DeliveryPresentationSurfaceKind,
  instanceId: string
): void {
  const at = typeof performance !== "undefined" ? performance.now() : Date.now();
  mounts.push({ kind, instanceId, at });
  events.push({ name: `${kind}_mount`, at, detail: { instanceId } });
  if (typeof window !== "undefined") {
    (window as unknown as { __dibayDeliveryPresentation?: unknown }).__dibayDeliveryPresentation =
      getDeliveryPresentationEvidenceSnapshot();
  }
}

export function deliveryPresentationMarkUnmount(
  kind: DeliveryPresentationSurfaceKind,
  instanceId: string
): void {
  const at = typeof performance !== "undefined" ? performance.now() : Date.now();
  unmounts.push({ kind, instanceId, at });
  events.push({ name: `${kind}_unmount`, at, detail: { instanceId } });
  if (typeof window !== "undefined") {
    (window as unknown as { __dibayDeliveryPresentation?: unknown }).__dibayDeliveryPresentation =
      getDeliveryPresentationEvidenceSnapshot();
  }
}

export function deliveryPresentationMarkEvent(
  name: string,
  detail?: Record<string, unknown>
): void {
  const at = typeof performance !== "undefined" ? performance.now() : Date.now();
  events.push({ name, at, detail });
  if (typeof window !== "undefined") {
    (window as unknown as { __dibayDeliveryPresentation?: unknown }).__dibayDeliveryPresentation =
      getDeliveryPresentationEvidenceSnapshot();
  }
}

export function getDeliveryPresentationEvidenceSnapshot(): {
  browseMountCount: number;
  browseUnmountCount: number;
  storeMountCount: number;
  storeUnmountCount: number;
  browseInstanceIds: string[];
  storeInstanceIds: string[];
  events: typeof events;
} {
  return {
    browseMountCount: mounts.filter((m) => m.kind === "browse").length,
    browseUnmountCount: unmounts.filter((m) => m.kind === "browse").length,
    storeMountCount: mounts.filter((m) => m.kind === "store").length,
    storeUnmountCount: unmounts.filter((m) => m.kind === "store").length,
    browseInstanceIds: mounts.filter((m) => m.kind === "browse").map((m) => m.instanceId),
    storeInstanceIds: mounts.filter((m) => m.kind === "store").map((m) => m.instanceId),
    events: events.slice(-80),
  };
}

export function resetDeliveryPresentationEvidenceForTests(): void {
  mounts.length = 0;
  unmounts.length = 0;
  events.length = 0;
  browseSeq = 0;
  storeSeq = 0;
}
