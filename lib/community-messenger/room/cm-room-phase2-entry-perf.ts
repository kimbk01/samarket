"use client";

import { recordRouteEntryElapsedMetricOnce, recordRouteEntryMetric } from "@/lib/runtime/samarket-runtime-debug";

let hydratedModuleEvalMs: number | null = null;
let deferredEffectsCount = 0;

export function noteCmRoomPhase2HydratedModuleEval(): void {
  if (hydratedModuleEvalMs != null) return;
  if (typeof performance === "undefined") return;
  hydratedModuleEvalMs = Math.round(performance.now());
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "phase2_parse_eval_ms");
}

export function noteCmRoomPhase2ControllerStart(): void {
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "phase2_controller_start_ms");
}

export function noteCmRoomPhase2ControllerDone(): void {
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "phase2_controller_done_ms");
}

export function noteCmRoomPhase2HydratedFirstRender(): void {
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "phase2_first_commit_ms");
}

export function bumpCmRoomPhase2DeferredEffect(): void {
  deferredEffectsCount += 1;
  recordRouteEntryMetric("messenger_room_entry", "deferred_effects_count", deferredEffectsCount);
}
