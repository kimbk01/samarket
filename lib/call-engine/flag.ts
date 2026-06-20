"use client";

/** V2 default ON after accept/join fix. Set NEXT_PUBLIC_DIBAY_CALL_ENGINE_V2=0 to opt out. */
export function isCallEngineV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_DIBAY_CALL_ENGINE_V2 !== "0";
}
