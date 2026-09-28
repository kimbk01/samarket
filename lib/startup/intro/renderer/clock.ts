/**
 * Renderer clock boundary. Playback UI is Rebuild G.
 * B only establishes that time belongs to the renderer, not CSS.
 */

export type IntroRendererClockPhase = "idle" | "enter" | "hold" | "transition" | "exit";

export type IntroRendererClock = {
  sceneIndex: number;
  elapsedMs: number;
  phase: IntroRendererClockPhase;
};

export function createIdleIntroRendererClock(): IntroRendererClock {
  return { sceneIndex: 0, elapsedMs: 0, phase: "idle" };
}
