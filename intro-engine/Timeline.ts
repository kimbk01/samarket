import { INTRO_HANDOFF_FAIL_OPEN_MS } from "./identity";

export type IntroTimelineEvent =
  | "INTRO_FIRST_FRAME_READY"
  | "INTRO_ENDED"
  | "HANDOFF"
  | "HANDOFF_FAIL_OPEN"
  | "ABORT";

export type IntroTimelineListener = (event: IntroTimelineEvent, atMs: number) => void;

export type IntroTimelineHandle = {
  start: () => void;
  notifyHomePresentationReady: () => void;
  abort: () => void;
  stop: () => void;
  getState: () => {
    started: boolean;
    firstFrameReady: boolean;
    ended: boolean;
    homeReady: boolean;
    handedOff: boolean;
  };
};

/**
 * First slice motion: NONE. Clock is rAF. No setTimeout visual mask.
 */
export function createIntroTimeline(input: {
  durationMs: number;
  onEvent: IntroTimelineListener;
  now?: () => number;
  raf?: (cb: (time: number) => void) => number;
  caf?: (id: number) => void;
}): IntroTimelineHandle {
  const nowFn = input.now ?? (() => performance.now());
  const raf = input.raf ?? ((cb: (time: number) => void) => requestAnimationFrame(cb));
  const caf = input.caf ?? ((id) => cancelAnimationFrame(id));
  const durationMs = Math.max(1, input.durationMs);

  let started = false;
  let firstFrameReady = false;
  let ended = false;
  let homeReady = false;
  let handedOff = false;
  let aborted = false;
  let startAt = 0;
  let rafId = 0;

  const emit = (event: IntroTimelineEvent) => {
    input.onEvent(event, nowFn() - startAt);
  };

  const tryHandoff = () => {
    if (handedOff || aborted) return;
    if (ended && homeReady) {
      handedOff = true;
      emit("HANDOFF");
    }
  };

  const tick = () => {
    if (!started || aborted || handedOff) return;
    const elapsed = nowFn() - startAt;
    if (!ended && elapsed >= durationMs) {
      ended = true;
      emit("INTRO_ENDED");
      tryHandoff();
    }
    if (ended && !homeReady && elapsed >= durationMs + INTRO_HANDOFF_FAIL_OPEN_MS) {
      handedOff = true;
      emit("HANDOFF_FAIL_OPEN");
      return;
    }
    if (!handedOff) rafId = raf(tick);
  };

  return {
    start() {
      if (started) return;
      started = true;
      startAt = nowFn();
      firstFrameReady = true;
      emit("INTRO_FIRST_FRAME_READY");
      rafId = raf(tick);
    },
    notifyHomePresentationReady() {
      if (aborted || handedOff) return;
      homeReady = true;
      tryHandoff();
    },
    abort() {
      if (handedOff || aborted) return;
      aborted = true;
      handedOff = true;
      if (rafId) caf(rafId);
      emit("ABORT");
    },
    stop() {
      if (rafId) caf(rafId);
      rafId = 0;
    },
    getState() {
      return { started, firstFrameReady, ended, homeReady, handedOff };
    },
  };
}
