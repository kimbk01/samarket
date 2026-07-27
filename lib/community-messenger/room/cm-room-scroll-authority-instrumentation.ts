/**
 * Dev-only scroll authority probe — product runtime no-op unless flag on.
 * Dump: window.__cmScrollAuthorityLog / .qa-logs (manual export).
 */

export type CmScrollAuthorityEvent = {
  ts: number;
  roomId: string;
  event:
    | "timeline_mount"
    | "composer_mount"
    | "rows_paint"
    | "scroll_command"
    | "initial_anchor_applied"
    | "stable"
    | "resize_signal"
    | "resize_guard_skip";
  source?: string;
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
  roomGeneration?: number;
  detail?: Record<string, unknown>;
};

const FLAG =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_CM_SCROLL_AUTHORITY_PROBE === "1";

type Bag = {
  roomId: string;
  roomGeneration: number;
  events: CmScrollAuthorityEvent[];
  scrollCommandCount: number;
  initialAnchorCount: number;
  sources: string[];
};

declare global {
  interface Window {
    __cmScrollAuthorityLog?: Bag[];
    __cmScrollAuthorityActive?: Bag | null;
  }
}

function now(): number {
  return typeof performance !== "undefined" ? Math.round(performance.now()) : Date.now();
}

function activeBag(): Bag | null {
  if (!FLAG || typeof window === "undefined") return null;
  return window.__cmScrollAuthorityActive ?? null;
}

export function cmScrollAuthorityProbeEnabled(): boolean {
  return FLAG;
}

export function beginCmScrollAuthoritySession(roomId: string, roomGeneration: number): void {
  if (!FLAG || typeof window === "undefined") return;
  const rid = roomId.trim();
  if (!rid) return;
  const bag: Bag = {
    roomId: rid,
    roomGeneration,
    events: [],
    scrollCommandCount: 0,
    initialAnchorCount: 0,
    sources: [],
  };
  window.__cmScrollAuthorityActive = bag;
  const all = window.__cmScrollAuthorityLog ?? [];
  all.push(bag);
  window.__cmScrollAuthorityLog = all;
}

export function noteCmScrollAuthorityEvent(
  event: CmScrollAuthorityEvent["event"],
  payload: Omit<CmScrollAuthorityEvent, "ts" | "event" | "roomId"> & { roomId?: string } = {}
): void {
  const bag = activeBag();
  if (!bag) return;
  const row: CmScrollAuthorityEvent = {
    ts: now(),
    roomId: payload.roomId?.trim() || bag.roomId,
    event,
    source: payload.source,
    scrollTop: payload.scrollTop,
    scrollHeight: payload.scrollHeight,
    clientHeight: payload.clientHeight,
    roomGeneration: payload.roomGeneration ?? bag.roomGeneration,
    detail: payload.detail,
  };
  bag.events.push(row);
  if (event === "scroll_command" && payload.source) {
    bag.scrollCommandCount += 1;
    bag.sources.push(payload.source);
    if (
      payload.source === "initial_latest" ||
      payload.source === "initial_last_read" ||
      payload.source === "initial_unread_boundary" ||
      payload.source === "persisted_restore" ||
      payload.source.startsWith("initial_") ||
      payload.source === "room_entry_initial" ||
      payload.source === "initial_load" ||
      payload.source === "push_entry_initial_load" ||
      payload.source === "room_entry_restore" ||
      payload.source === "timeline_delivery_direct_paint"
    ) {
      bag.initialAnchorCount += 1;
    }
  }
  if (event === "initial_anchor_applied") {
    bag.initialAnchorCount = Math.max(bag.initialAnchorCount, 1);
  }
  try {
    console.debug("[cm-scroll-authority]", JSON.stringify(row));
  } catch {
    /* noop */
  }
}

/** Test helper — simulate inventory counts without DOM */
export function summarizeCmScrollAuthorityBag(bag: Bag): {
  initialAnchorCount: number;
  scrollCommandCount: number;
  legacySettleCount: number;
  sources: string[];
} {
  const legacySettleCount = bag.sources.filter(
    (s) =>
      s.includes("tail_settle") ||
      s === "legacy_tail_settle" ||
      s === "schedule_after_rows_painted" ||
      s === "legacy_after_rows"
  ).length;
  return {
    initialAnchorCount: bag.initialAnchorCount,
    scrollCommandCount: bag.scrollCommandCount,
    legacySettleCount,
    sources: [...bag.sources],
  };
}
