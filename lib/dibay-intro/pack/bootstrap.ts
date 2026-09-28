export const DIBAY_INTRO_BOOTSTRAP_STEPS = [
  "PACK_OPEN",
  "MANIFEST_READ",
  "MANIFEST_PARSE",
  "ENGINE_VERIFY",
  "DOCUMENT_VERIFY",
  "ASSET_MAP",
  "ASSET_VERIFY",
  "FONT_LOAD",
  "MEDIA_LOAD",
  "SCENE_BUILD",
  "FIRST_LAYOUT",
  "FIRST_PAINT",
  "INTRO_FIRST_FRAME_READY",
] as const;

export type DibayIntroBootstrapStep = (typeof DIBAY_INTRO_BOOTSTRAP_STEPS)[number];
export type DibayIntroTraceResult = "BEGIN" | "PASS" | "FAIL";

export function bootstrapEventName(step: DibayIntroBootstrapStep, result: DibayIntroTraceResult): string {
  return `${step}_${result}`;
}

export const DIBAY_INTRO_BOOTSTRAP_EVENT_NAMES = DIBAY_INTRO_BOOTSTRAP_STEPS.flatMap((step) =>
  (["BEGIN", "PASS", "FAIL"] as const).map((result) => bootstrapEventName(step, result)),
);

export type DibayIntroBootstrapTrace = {
  step: DibayIntroBootstrapStep;
  result: DibayIntroTraceResult;
  reason?: string;
  at: number;
};

export function createBootstrapTraceBuffer() {
  const traces: DibayIntroBootstrapTrace[] = [];
  let firstFailure: DibayIntroBootstrapTrace | null = null;

  function emit(step: DibayIntroBootstrapStep, result: DibayIntroTraceResult, reason?: string): DibayIntroBootstrapTrace {
    const trace: DibayIntroBootstrapTrace = { step, result, reason, at: Date.now() };
    traces.push(trace);
    if (result === "FAIL" && !firstFailure) firstFailure = trace;
    return trace;
  }

  return {
    emit,
    traces: () => traces.slice(),
    firstFailure: () => firstFailure,
  };
}
