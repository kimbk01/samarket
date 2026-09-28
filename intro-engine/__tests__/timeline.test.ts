import { describe, expect, it } from "vitest";
import { createIntroTimeline } from "../Timeline";
import { INTRO_HANDOFF_FAIL_OPEN_MS } from "../identity";

function createClock() {
  const events: string[] = [];
  let now = 0;
  const queued: Array<(time: number) => void> = [];
  const timeline = createIntroTimeline({
    durationMs: 100,
    now: () => now,
    raf: (next) => {
      queued.push(next);
      return queued.length;
    },
    caf: () => {
      queued.length = 0;
    },
    onEvent: (event) => events.push(event),
  });
  const fire = () => {
    const next = queued[queued.length - 1];
    if (!next) {
      throw new Error("timeline raf callback missing");
    }
    next(now);
  };
  return {
    events,
    timeline,
    setNow(value: number) {
      now = value;
    },
    fire,
  };
}

describe("intro-engine timeline", () => {
  it("holds last frame until HOME then handoffs without setTimeout", () => {
    const clock = createClock();
    clock.timeline.start();
    expect(clock.events).toEqual(["INTRO_FIRST_FRAME_READY"]);
    clock.setNow(100);
    clock.fire();
    expect(clock.events).toContain("INTRO_ENDED");
    expect(clock.events).not.toContain("HANDOFF");
    clock.timeline.notifyHomePresentationReady();
    expect(clock.events).toContain("HANDOFF");
  });

  it("fail-opens on the same clock after the bound", () => {
    const events: string[] = [];
    let now = 0;
    const queued: Array<(time: number) => void> = [];
    const timeline = createIntroTimeline({
      durationMs: 50,
      now: () => now,
      raf: (next) => {
        queued.push(next);
        return queued.length;
      },
      onEvent: (event) => events.push(event),
    });
    timeline.start();
    now = 50;
    const afterEnd = queued[queued.length - 1];
    if (!afterEnd) throw new Error("timeline raf callback missing");
    afterEnd(now);
    now = 50 + INTRO_HANDOFF_FAIL_OPEN_MS;
    const afterBound = queued[queued.length - 1];
    if (!afterBound) throw new Error("timeline raf callback missing");
    afterBound(now);
    expect(events).toContain("HANDOFF_FAIL_OPEN");
  });
});
