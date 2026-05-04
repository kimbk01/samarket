"use client";

type CmReceiveLatencyEntry = Partial<{
  sender_click_ms: number;
  send_api_start_ms: number;
  send_api_done_ms: number;
  db_message_created_at: string;
  realtime_event_received_ms: number;
  realtime_payload_room_id: string;
  realtime_payload_message_id: string;
  receiver_store_apply_start_ms: number;
  receiver_store_apply_done_ms: number;
  unread_delta_applied_ms: number;
  bottom_badge_updated_ms: number;
  room_list_row_updated_ms: number;
  notification_decision_ms: number;
  notification_sound_start_ms: number;
  push_decision_ms: number;
  total_receive_elapsed_ms: number;
}>;

type CmReceiveLatencyKey = string;

type CmReceiveLatencyStore = {
  v: 1;
  byKey: Map<CmReceiveLatencyKey, CmReceiveLatencyEntry>;
};

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function store(): CmReceiveLatencyStore | null {
  if (typeof window === "undefined") return null;
  const anyWin = window as unknown as { __cmReceiveLatency?: CmReceiveLatencyStore };
  if (!anyWin.__cmReceiveLatency) {
    anyWin.__cmReceiveLatency = { v: 1, byKey: new Map() };
  }
  return anyWin.__cmReceiveLatency;
}

export function cmReceiveLatencyKey(args: {
  roomId: string;
  messageId?: string | null;
  clientMessageId?: string | null;
}): string {
  const r = args.roomId?.trim() ?? "";
  const mid = args.messageId?.trim() ?? "";
  const cmid = args.clientMessageId?.trim() ?? "";
  if (mid) return `msg:${r}:${mid}`;
  if (cmid) return `client:${r}:${cmid}`;
  return `room:${r}:${Math.round(nowMs())}`;
}

export function cmReceiveLatencyMark(key: CmReceiveLatencyKey, patch: CmReceiveLatencyEntry): void {
  if (process.env.NODE_ENV === "production") return;
  const s = store();
  if (!s) return;
  const prev = s.byKey.get(key) ?? {};
  const next = { ...prev, ...patch };
  s.byKey.set(key, next);
  // eslint-disable-next-line no-console
  console.info("[cm-receive-latency]", { key, ...next });
}

export function cmReceiveLatencyMarkPoint(
  key: CmReceiveLatencyKey,
  field: keyof CmReceiveLatencyEntry,
  value?: number | string
): void {
  if (process.env.NODE_ENV === "production") return;
  if (value === undefined) return;
  cmReceiveLatencyMark(key, { [field]: value } as any);
}

export function cmReceiveLatencyNow(): number {
  return nowMs();
}

function attachDevConsoleHelpers(): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof window === "undefined") return;
  const anyWin = window as any;
  if (anyWin.__cmReceiveLatencyHelpersAttached) return;
  anyWin.__cmReceiveLatencyHelpersAttached = true;
  anyWin.cmReceiveLatencyDump = () => {
    const s = store();
    if (!s) return [];
    return [...s.byKey.entries()].map(([key, value]) => ({ key, ...value }));
  };
  anyWin.cmReceiveLatencyClear = () => {
    const s = store();
    if (!s) return;
    s.byKey.clear();
  };

  // eslint-disable-next-line no-console
  console.info("[cm-receive-latency]", "helpers_attached", {
    hasDump: typeof anyWin.cmReceiveLatencyDump === "function",
    hasClear: typeof anyWin.cmReceiveLatencyClear === "function",
  });
}

attachDevConsoleHelpers();

