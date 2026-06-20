"use client";

/** Parallel rollout — set NEXT_PUBLIC_DIBAY_CALL_ENGINE_V2=1 to enable engine path */
export function isCallEngineV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_DIBAY_CALL_ENGINE_V2 === "1";
}
