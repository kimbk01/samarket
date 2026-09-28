import { describe, expect, it } from "vitest";
import {
  defaultIntroV3LayerMotion,
  motionLooksLikeCss,
  parseIntroV3MotionClip,
  parseIntroV3SceneTransition,
  INTRO_V3_ENTER_PRESETS,
} from "@/lib/startup/intro-v3/motion";

describe("intro-v3 motion schema", () => {
  it("accepts semantic presets and rejects unknown CSS", () => {
    const clip = parseIntroV3MotionClip(
      { preset: "FADE_IN", delayMs: 80, durationMs: 400, easing: "STANDARD" },
      INTRO_V3_ENTER_PRESETS
    );
    expect(clip?.preset).toBe("FADE_IN");
    expect(parseIntroV3MotionClip({ preset: "FADE_IN", delayMs: 0, durationMs: 300, easing: "ease-in-out" }, INTRO_V3_ENTER_PRESETS)).toBeNull();
    expect(motionLooksLikeCss("cubic-bezier(0.4, 0, 0.2, 1)")).toBe(true);
    expect(motionLooksLikeCss({ easing: "ease-out", duration: "300ms" })).toBe(true);
    expect(parseIntroV3SceneTransition({ preset: "FADE", durationMs: 300, easing: "STANDARD" })?.preset).toBe("FADE");
    expect(parseIntroV3SceneTransition({ preset: "FADE", durationMs: "300ms", easing: "STANDARD" })).toBeNull();
  });

  it("defaults idle and exit to NONE", () => {
    const motion = defaultIntroV3LayerMotion();
    expect(motion.idle.preset).toBe("NONE");
    expect(motion.exit.preset).toBe("NONE");
  });
});
