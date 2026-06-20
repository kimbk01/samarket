"use client";

import {
  getActiveCmRoomEntrySessionId,
  getActiveCmRoomEntrySessionRoomId,
  assertCmRoomTimingEmit,
  markCmRoomTimingMetricRecorded,
  msSinceSessionTap,
  hasCmRoomEntryTimingSession,
} from "@/lib/community-messenger/room/cm-room-entry-timing-session";
import {
  finalizeCmRoomEntryComposerFrameVisibleMs,
  finalizeCmRoomEntryShellVisibleMs,
  getCmRoomEntryMilestoneMs,
} from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { recordRoomEntryStage } from "@/lib/community-messenger/room/cm-room-entry-timing";
import { useCmRoomOpeningOverlayStore } from "@/lib/community-messenger/room/cm-room-opening-overlay-store";
import { noteTradeChatRoomHeaderReadyForShellBreakdown, noteTradeChatRoomShellRenderBlockingMs } from "@/lib/trade/trade-chat-room-shell-breakdown-perf";
import { cmMessengerPerfVerboseLog } from "@/lib/community-messenger/room/cm-messenger-perf-verbose-log";

let pass1HeaderMs = 0;
let pass1ComposerMs = 0;

const passRenderLongtaskMs: Record<0 | 1 | 2, number> = { 0: 0, 1: 0, 2: 0 };

function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function resetCmRoomPassInstrumentationForTests(): void {
  pass1HeaderMs = 0;
  pass1ComposerMs = 0;
  passRenderLongtaskMs[0] = 0;
  passRenderLongtaskMs[1] = 0;
  passRenderLongtaskMs[2] = 0;
}

export function noteCmPassRenderLongtaskOverlap(pass: 0 | 1 | 2, durationMs: number): void {
  if (durationMs < 50) return;
  passRenderLongtaskMs[pass] += durationMs;
  noteTradeChatRoomShellRenderBlockingMs(durationMs);
}

export function logCmPassRender(payload: {
  pass: 0 | 1 | 2;
  render_ms: number;
  commit_ms: number;
}): void {
  const roomId = getActiveCmRoomEntrySessionRoomId();
  const sessionId = getActiveCmRoomEntrySessionId();
  if (!roomId || !sessionId) return;
  cmMessengerPerfVerboseLog("[cm-pass-render]", {
    roomId,
    sessionId,
    pass: payload.pass,
    render_ms: payload.render_ms,
    commit_ms: payload.commit_ms,
    longtask_overlap_ms: Math.round(passRenderLongtaskMs[payload.pass]),
  });
}

export function emitCmRoomPass0ShellLog(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  const overlay = useCmRoomOpeningOverlayStore.getState();
  if (overlay.openingRoomId === id && overlay.shellVisibleAt > 0) return;
  const session = assertCmRoomTimingEmit({ roomId: id, metric: "pass0_shell" });
  if (!session) return;
  markCmRoomTimingMetricRecorded("pass0_shell");
  const shellVisibleMs = msSinceSessionTap(session.sessionId) ?? 0;
  recordRoomEntryStage("shell");
  finalizeCmRoomEntryShellVisibleMs(id, false, "pass0_shell");
  finalizeCmRoomEntryComposerFrameVisibleMs(id, false);
  cmMessengerPerfVerboseLog("[cm-room-pass0-shell]", {
    roomId: id,
    sessionId: session.sessionId,
    shell_visible_ms: shellVisibleMs,
    network_waited: false,
    data_bound: false,
  });
}

export function noteCmRoomPass1HeaderMs(): void {
  const roomId = getActiveCmRoomEntrySessionRoomId();
  if (!roomId || pass1HeaderMs > 0) return;
  if (!hasCmRoomEntryTimingSession(roomId)) return;
  pass1HeaderMs = msSinceSessionTap() ?? 0;
  noteTradeChatRoomHeaderReadyForShellBreakdown();
  recordRoomEntryStage("header_seed");
  tryEmitCmRoomPass1HeaderComposerLog();
}

export function noteCmRoomPass1ComposerMs(): void {
  const roomId = getActiveCmRoomEntrySessionRoomId();
  if (!roomId || pass1ComposerMs > 0) return;
  if (!hasCmRoomEntryTimingSession(roomId)) return;
  pass1ComposerMs = getCmRoomEntryMilestoneMs("composer_visible_ms") ?? msSinceSessionTap() ?? 0;
  recordRoomEntryStage("composer");
  tryEmitCmRoomPass1HeaderComposerLog();
}

function tryEmitCmRoomPass1HeaderComposerLog(): void {
  const roomId = getActiveCmRoomEntrySessionRoomId();
  if (!roomId || pass1HeaderMs <= 0 || pass1ComposerMs <= 0) return;
  const session = assertCmRoomTimingEmit({ roomId, metric: "pass1_header_composer" });
  if (!session) return;
  markCmRoomTimingMetricRecorded("pass1_header_composer");
  cmMessengerPerfVerboseLog("[cm-room-pass1-header-composer]", {
    roomId,
    sessionId: session.sessionId,
    header_ms: pass1HeaderMs,
    composer_ms: pass1ComposerMs,
    seed_bound: true,
    message_viewport_deferred: true,
  });
}

export function emitCmRoomPass2ViewportLog(payload: {
  visible_rows: number;
  empty_room: boolean;
  virtualized: boolean;
  first_row_rendered: boolean;
  idle_remaining_rows: number;
  network_waited?: boolean;
  timeline_client_height?: number;
  timeline_scroll_height?: number;
  timeline_row_count?: number;
  offset_parent_null?: boolean;
  parent_hidden?: boolean;
  virtualizer_total_size?: number;
  scroll_top?: number;
}): void {
  const roomId = getActiveCmRoomEntrySessionRoomId();
  if (!roomId) return;
  const session = assertCmRoomTimingEmit({ roomId, metric: "pass2_viewport" });
  if (!session) return;
  markCmRoomTimingMetricRecorded("pass2_viewport");
  const viewportVisibleMs = msSinceSessionTap(session.sessionId) ?? 0;
  if (payload.first_row_rendered || payload.empty_room) {
    recordRoomEntryStage("message_seed");
  }
  recordRoomEntryStage("message_viewport");
  cmMessengerPerfVerboseLog("[cm-room-pass2-viewport]", {
    roomId,
    sessionId: session.sessionId,
    viewport_visible_ms: viewportVisibleMs,
    visible_rows: payload.visible_rows,
    empty_room: payload.empty_room,
    virtualized: payload.virtualized,
    first_row_rendered: payload.first_row_rendered,
    network_waited: payload.network_waited ?? false,
    idle_remaining_rows: payload.idle_remaining_rows,
    timeline_client_height: payload.timeline_client_height ?? null,
    timeline_scroll_height: payload.timeline_scroll_height ?? null,
    timeline_row_count: payload.timeline_row_count ?? null,
    offset_parent_null: payload.offset_parent_null ?? null,
    parent_hidden: payload.parent_hidden ?? null,
    virtualizer_total_size: payload.virtualizer_total_size ?? null,
    scroll_top: payload.scroll_top ?? null,
  });
}

export function emitCmRoomTimelineEntryProbeLog(
  roomId: string,
  reason: string,
  probe: {
    timelineClientHeight: number;
    timelineScrollHeight: number;
    timelineRowCount: number;
    offsetParentNull: boolean;
    parentHidden: boolean;
    virtualizerTotalSize: number;
    scrollTop: number;
    composerHeightPx: string;
    paintReady: boolean;
  }
): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  cmMessengerPerfVerboseLog("[cm-room-timeline-entry-probe]", {
    roomId: id,
    reason,
    paint_ready: probe.paintReady,
    timeline_client_height: probe.timelineClientHeight,
    timeline_scroll_height: probe.timelineScrollHeight,
    timeline_row_count: probe.timelineRowCount,
    offset_parent_null: probe.offsetParentNull,
    parent_hidden: probe.parentHidden,
    virtualizer_total_size: probe.virtualizerTotalSize,
    scroll_top: probe.scrollTop,
    composer_height_px: probe.composerHeightPx,
  });
}

export function measureCmPassRenderCommit(pass: 0 | 1 | 2, renderStartMs: number): void {
  const commitMs = Math.round(perfNow() - renderStartMs);
  logCmPassRender({ pass, render_ms: commitMs, commit_ms: commitMs });
}
