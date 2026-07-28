/**
 * READ-ONLY resize-cycle instrumentation (MEASURE ONLY).
 *
 * DO NOT: change scrollTop / settle / stick / control flow.
 * DO NOT: add timeout / rAF / forced scroll writes here.
 * Removable: delete this file + call sites tagged CM_RESIZE_CYCLE_PROBE.
 */
export type CmResizeCycleNote = {
  resizeCycleId: string;
  t: number;
  step: string;
  roomId?: string | null;
  [key: string]: unknown;
};

type CycleState = {
  resizeCycleId: string;
  source: string;
  roomId: string | null;
  t0: number;
  notes: CmResizeCycleNote[];
};

const PREFIX = "[cm-resize-cycle]";

let seq = 0;
let active: CycleState | null = null;

function emit(note: CmResizeCycleNote): void {
  if (typeof window === "undefined") return;
  try {
    // eslint-disable-next-line no-console -- measure-only probe
    console.log(PREFIX, JSON.stringify(note));
  } catch {
    /* ignore */
  }
  try {
    const w = window as unknown as {
      __cmResizeCycleNotes?: CmResizeCycleNote[];
      __cmResizeCycleActive?: CycleState | null;
    };
    if (Array.isArray(w.__cmResizeCycleNotes)) w.__cmResizeCycleNotes.push(note);
    else w.__cmResizeCycleNotes = [note];
    w.__cmResizeCycleActive = active;
  } catch {
    /* ignore */
  }
}

/** CM_RESIZE_CYCLE_PROBE */
export function cmResizeCycleBegin(input: {
  source: string;
  roomId?: string | null;
}): string {
  const resizeCycleId = `rc_${Date.now()}_${++seq}`;
  active = {
    resizeCycleId,
    source: input.source,
    roomId: input.roomId?.trim() || null,
    t0: Date.now(),
    notes: [],
  };
  const note: CmResizeCycleNote = {
    resizeCycleId,
    t: Date.now(),
    step: "cycle_begin",
    source: input.source,
    roomId: active.roomId,
  };
  active.notes.push(note);
  emit(note);
  return resizeCycleId;
}

/** CM_RESIZE_CYCLE_PROBE */
export function cmResizeCycleId(): string | null {
  return active?.resizeCycleId ?? null;
}

/** CM_RESIZE_CYCLE_PROBE */
export function cmResizeCycleNote(
  step: string,
  payload: Record<string, unknown> = {}
): void {
  const resizeCycleId = active?.resizeCycleId ?? `orphan_${Date.now()}`;
  const note: CmResizeCycleNote = {
    resizeCycleId,
    t: Date.now(),
    step,
    roomId: active?.roomId ?? null,
    ...payload,
  };
  active?.notes.push(note);
  emit(note);
}

/** CM_RESIZE_CYCLE_PROBE */
export function cmResizeCycleReadViewport(viewport: HTMLElement | null | undefined): {
  scrollTop: number | null;
  clientHeight: number | null;
  scrollHeight: number | null;
  maxScroll: number | null;
} {
  if (!viewport) {
    return { scrollTop: null, clientHeight: null, scrollHeight: null, maxScroll: null };
  }
  const scrollTop = viewport.scrollTop;
  const clientHeight = viewport.clientHeight;
  const scrollHeight = viewport.scrollHeight;
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  return {
    scrollTop: Math.round(scrollTop),
    clientHeight: Math.round(clientHeight),
    scrollHeight: Math.round(scrollHeight),
    maxScroll: Math.round(maxScroll),
  };
}

const ENTRY_GATE_PREFIX = "[cm-entry-gate]";

/**
 * CM_ENTRY_GATE_PROBE (read-only) — initial-anchor early-return lock only.
 * Removable with CM_RESIZE_CYCLE_PROBE call sites.
 */
export function cmEntryGateNote(
  step: string,
  payload: Record<string, unknown> = {}
): void {
  if (typeof window === "undefined") return;
  const note = {
    t: Date.now(),
    step,
    ...payload,
  };
  try {
    // eslint-disable-next-line no-console -- measure-only probe
    console.log(ENTRY_GATE_PREFIX, JSON.stringify(note));
  } catch {
    /* ignore */
  }
  try {
    const w = window as unknown as { __cmEntryGateNotes?: Array<Record<string, unknown>> };
    if (Array.isArray(w.__cmEntryGateNotes)) w.__cmEntryGateNotes.push(note);
    else w.__cmEntryGateNotes = [note];
  } catch {
    /* ignore */
  }
}
