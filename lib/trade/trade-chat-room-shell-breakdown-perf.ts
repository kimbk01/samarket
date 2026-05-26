/**
 * 거래 채팅 방 shell ready 구간 분해 — UI·read/unread·API shape 변경 없음, 계측만.
 * `bootstrap_fetch_done` ↔ 실제 shell mount 사이 병목(청크·Phase2 defer 등) 구분용.
 */
import { readTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";
import {
  isTradeC2CPerfEnabled,
  recordTradeC2CMetricMs,
  type TradeC2CPerfMetricKey,
} from "@/lib/trade/trade-c2c-perf-metrics";

export type TradeChatRoomShellMountSource =
  | "pre_route_overlay"
  | "pass0_shell"
  | "phase2_main_shell";

export type TradeChatRoomShellReadyWaitReason =
  | "inner_chunk_pending"
  | "phase1_hook_init"
  | "phase2_body_dynamic_defer"
  | "phase2_controller_pending"
  | "bootstrap_gate_early_done"
  | "pass0_strict_block"
  | "shell_trace_gated"
  | "shell_at_pass0"
  | "shell_at_phase2";

const E2E_WAIT_REASON_KEY = "room_shell_ready_wait_reason" as const;

let bootstrapDoneAt: number | null = null;
let shellMountAt: number | null = null;
let shellMountSource: TradeChatRoomShellMountSource | null = null;
let headerReadyAt: number | null = null;
let firstMessageReadyAt: number | null = null;
let realtimeReadyAt: number | null = null;
let presenceReadyAt: number | null = null;
let readEffectReadyAt: number | null = null;
let snapshotReadyAt: number | null = null;
let initialMessageCount: number | null = null;
let renderBlockingTaskMs = 0;
let innerChunkEvalAt: number | null = null;
let phase2BodyDynamicReadyAt: number | null = null;
let waitReason: TradeChatRoomShellReadyWaitReason | null = null;

function enabled(): boolean {
  return isTradeC2CPerfEnabled() && Boolean(readTradeChatEntryMark());
}

function segFromShell(at: number | null): number | null {
  if (at == null || shellMountAt == null) return null;
  const d = Math.round(at - shellMountAt);
  return d < 0 ? 0 : d;
}

function segBootstrapToShell(): number | null {
  if (bootstrapDoneAt == null || shellMountAt == null) return null;
  const d = Math.round(shellMountAt - bootstrapDoneAt);
  return d < 0 ? 0 : d;
}

function mirrorWaitReason(reason: TradeChatRoomShellReadyWaitReason): void {
  if (typeof window === "undefined") return;
  try {
    const prevRaw = sessionStorage.getItem("samarket:debug:e2e:tradeC2cPhaseLastMs");
    const prev = (prevRaw ? (JSON.parse(prevRaw) as Record<string, unknown>) : {}) as Record<
      string,
      unknown
    >;
    sessionStorage.setItem(
      "samarket:debug:e2e:tradeC2cPhaseLastMs",
      JSON.stringify({ ...prev, [E2E_WAIT_REASON_KEY]: reason })
    );
  } catch {
    /* ignore */
  }
}

function record(key: TradeC2CPerfMetricKey, ms: number): void {
  recordTradeC2CMetricMs(key, ms);
}

function flushBootstrapToShellMount(): void {
  const ms = segBootstrapToShell();
  if (ms != null) record("room_bootstrap_done_to_shell_mount_ms", ms);
}

function flushShellMountSegments(): void {
  recordSeg("room_shell_mount_to_header_ready_ms", headerReadyAt);
  recordSeg("room_shell_mount_to_first_message_ready_ms", firstMessageReadyAt);
  recordSeg("room_shell_mount_to_realtime_ready_ms", realtimeReadyAt);
  recordSeg("room_shell_mount_to_presence_ready_ms", presenceReadyAt);
  recordSeg("room_shell_mount_to_read_effect_ready_ms", readEffectReadyAt);
  recordSeg("room_shell_mount_to_snapshot_ready_ms", snapshotReadyAt);
  if (initialMessageCount != null) {
    record("room_initial_message_count", initialMessageCount);
  }
  if (renderBlockingTaskMs > 0) {
    record("room_initial_render_blocking_task_ms", Math.round(renderBlockingTaskMs));
  }
  if (waitReason) mirrorWaitReason(waitReason);
}

function recordSeg(key: TradeC2CPerfMetricKey, at: number | null): void {
  const ms = segFromShell(at);
  if (ms != null) record(key, ms);
}

/** BootstrapGate / fetchCommunityMessengerRoomBootstrapClient 완료 시각 */
export function noteTradeChatRoomBootstrapDoneForShellBreakdown(): void {
  if (!enabled()) return;
  if (bootstrapDoneAt != null) return;
  bootstrapDoneAt = Date.now();
}

export function noteTradeChatRoomInnerChunkEval(): void {
  if (!enabled()) return;
  if (innerChunkEvalAt != null) return;
  innerChunkEvalAt = Date.now();
}

export function noteTradeChatRoomPhase2BodyDynamicReady(): void {
  if (!enabled()) return;
  if (phase2BodyDynamicReadyAt != null) return;
  phase2BodyDynamicReadyAt = Date.now();
}

export function noteTradeChatRoomShellRenderBlockingMs(ms: number): void {
  if (!enabled() || ms < 50) return;
  renderBlockingTaskMs += ms;
}

/** 첫 shell DOM commit — Pass0 / Phase2Main / pre-route */
export function noteTradeChatRoomShellMounted(source: TradeChatRoomShellMountSource): void {
  if (!enabled()) return;
  if (shellMountAt != null) return;
  shellMountAt = Date.now();
  shellMountSource = source;
  waitReason = resolveShellReadyWaitReason(source);
  flushBootstrapToShellMount();
  flushShellMountSegments();
}

export function noteTradeChatRoomHeaderReadyForShellBreakdown(): void {
  if (!enabled()) return;
  if (headerReadyAt != null) return;
  headerReadyAt = Date.now();
  recordSeg("room_shell_mount_to_header_ready_ms", headerReadyAt);
}

export function noteTradeChatRoomFirstMessageReadyForShellBreakdown(count: number): void {
  if (!enabled()) return;
  if (firstMessageReadyAt != null) return;
  firstMessageReadyAt = Date.now();
  initialMessageCount = count;
  recordSeg("room_shell_mount_to_first_message_ready_ms", firstMessageReadyAt);
  record("room_initial_message_count", count);
}

export function noteTradeChatRoomRealtimeReadyForShellBreakdown(): void {
  if (!enabled()) return;
  if (realtimeReadyAt != null) return;
  realtimeReadyAt = Date.now();
  recordSeg("room_shell_mount_to_realtime_ready_ms", realtimeReadyAt);
}

export function noteTradeChatRoomPresenceReadyForShellBreakdown(): void {
  if (!enabled()) return;
  if (presenceReadyAt != null) return;
  presenceReadyAt = Date.now();
  recordSeg("room_shell_mount_to_presence_ready_ms", presenceReadyAt);
}

export function noteTradeChatRoomReadEffectReadyForShellBreakdown(): void {
  if (!enabled()) return;
  if (readEffectReadyAt != null) return;
  readEffectReadyAt = Date.now();
  recordSeg("room_shell_mount_to_read_effect_ready_ms", readEffectReadyAt);
}

export function noteTradeChatRoomSnapshotReadyForShellBreakdown(): void {
  if (!enabled()) return;
  if (snapshotReadyAt != null) return;
  snapshotReadyAt = Date.now();
  recordSeg("room_shell_mount_to_snapshot_ready_ms", snapshotReadyAt);
}

function resolveShellReadyWaitReason(
  source: TradeChatRoomShellMountSource
): TradeChatRoomShellReadyWaitReason {
  const now = Date.now();
  if (
    innerChunkEvalAt != null &&
    shellMountAt != null &&
    innerChunkEvalAt < shellMountAt - 400
  ) {
    return "phase1_hook_init";
  }
  if (bootstrapDoneAt != null && bootstrapDoneAt < now - 2000) {
    if (innerChunkEvalAt != null && innerChunkEvalAt > bootstrapDoneAt + 500) {
      return "inner_chunk_pending";
    }
    if (innerChunkEvalAt == null && bootstrapDoneAt < now - 1000) {
      return "inner_chunk_pending";
    }
    return "bootstrap_gate_early_done";
  }
  if (phase2BodyDynamicReadyAt != null && phase2BodyDynamicReadyAt > (shellMountAt ?? now) - 500) {
    return "phase2_body_dynamic_defer";
  }
  if (source === "pass0_shell") return "shell_at_pass0";
  if (source === "phase2_main_shell") return "shell_at_phase2";
  if (source === "pre_route_overlay") return "shell_at_pass0";
  return "phase2_controller_pending";
}

/** shell journey flush 직전 — wait reason 갱신 */
export function finalizeTradeChatRoomShellReadyWaitReason(): void {
  if (!enabled() || shellMountAt == null) return;
  if (!waitReason) waitReason = resolveShellReadyWaitReason(shellMountSource ?? "pass0_shell");
  mirrorWaitReason(waitReason);
  flushShellMountSegments();
}

export function resetTradeChatRoomShellBreakdownForTests(): void {
  bootstrapDoneAt = null;
  shellMountAt = null;
  shellMountSource = null;
  headerReadyAt = null;
  firstMessageReadyAt = null;
  realtimeReadyAt = null;
  presenceReadyAt = null;
  readEffectReadyAt = null;
  snapshotReadyAt = null;
  initialMessageCount = null;
  renderBlockingTaskMs = 0;
  innerChunkEvalAt = null;
  phase2BodyDynamicReadyAt = null;
  waitReason = null;
}
