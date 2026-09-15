/**
 * T5 SEND→ACK stage trace — opt-in only (`x-samarket-t5-trace: 1`).
 * Does not change send semantics; measures wall offsets from request start.
 */
export type T5SendStageId =
  | "S0"
  | "S1"
  | "S2"
  | "S3"
  | "S4"
  | "S5"
  | "S6"
  | "S7"
  | "S8"
  | "S9"
  | "S10"
  | "S11"
  | "S12"
  | "S13"
  | "S14"
  | "S15"
  | "S16"
  | "S17";

export type T5SendTrace = {
  correlationId: string;
  messageId: string | null;
  roomId: string | null;
  /** performance.now() at S0 */
  t0: number;
  /** stage → ms since t0 */
  ms: Partial<Record<T5SendStageId, number>>;
  /** named sub-spans (e.g. notify, mirror) */
  spans: Record<string, number>;
};

export function createT5SendTrace(correlationId?: string): T5SendTrace {
  return {
    correlationId: (correlationId ?? "").trim() || `t5_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    messageId: null,
    roomId: null,
    t0: performance.now(),
    ms: { S0: 0 },
    spans: {},
  };
}

export function markT5(trace: T5SendTrace, stage: T5SendStageId): number {
  const at = Math.round(performance.now() - trace.t0);
  trace.ms[stage] = at;
  return at;
}

export function spanT5(trace: T5SendTrace, name: string, startedAtWall: number): number {
  const dur = Math.round(performance.now() - startedAtWall);
  trace.spans[name] = dur;
  return dur;
}

/** Accumulate duration into an existing span (multi-recipient loops). */
export function addSpanT5(trace: T5SendTrace, name: string, startedAtWall: number): number {
  const dur = Math.round(performance.now() - startedAtWall);
  trace.spans[name] = (typeof trace.spans[name] === "number" ? trace.spans[name] : 0) + dur;
  return dur;
}

export function t5TraceToHeader(trace: T5SendTrace): string {
  const parts = Object.entries(trace.ms)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  for (const [k, v] of Object.entries(trace.spans)) {
    parts.push(`${k}=${v}`);
  }
  return `cid=${trace.correlationId};${parts.join(";")}`;
}

export function t5TraceToJson(trace: T5SendTrace): Record<string, unknown> {
  return {
    correlationId: trace.correlationId,
    messageId: trace.messageId,
    roomId: trace.roomId,
    ms: { ...trace.ms },
    spans: { ...trace.spans },
  };
}

export function requestWantsT5Trace(req: { headers: { get(name: string): string | null } }): boolean {
  const h = req.headers.get("x-samarket-t5-trace")?.trim().toLowerCase();
  return h === "1" || h === "true" || h === "yes";
}
