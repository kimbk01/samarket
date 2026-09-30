/**
 * C6 — ADMIN / VALIDATOR / PACKAGE semantic × native canonical sets.
 * Each Transition/Motion token: SUPPORTED EVERYWHERE or REJECTED BEFORE LIVE.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MOTION_TYPES_V1,
  TRANSITION_TYPES_V1,
  isMotionTypeV1,
  isTransitionTypeV1,
  normalizeMotionV1,
  normalizeTransitionV1,
} from "@/lib/intro/contracts/capability-registry";
import {
  createEmptyV0Document,
  normalizeDocumentV1,
  validateDocumentV0,
  type IntroDocumentV1,
  type MotionTypeV1,
} from "@/lib/intro/contracts/document";

const ROOT = process.cwd();
const androidSrc = readFileSync(
  join(ROOT, "android/app/src/main/java/com/dibay/app/intro/DibayIntroPackModel.java"),
  "utf8",
);
const iosSrc = readFileSync(
  join(ROOT, "ios/App/App/Plugins/DibayIntroPackModel.swift"),
  "utf8",
);
const studioSrc = readFileSync(
  join(ROOT, "components/admin/intro/IntroStudioPage.tsx"),
  "utf8",
);

function androidCanonicalMotion(type: string): boolean {
  // Mirror isCanonicalMotionType after ENTER_TOP/BOTTOM alias only.
  const aliases: Record<string, string> = {
    ENTER_TOP: "ENTER_UP",
    ENTER_BOTTOM: "ENTER_DOWN",
  };
  const t = aliases[type] ?? type;
  return (
    t === "NONE" ||
    t === "FADE_IN" ||
    t === "ENTER_LEFT" ||
    t === "ENTER_RIGHT" ||
    t === "ENTER_UP" ||
    t === "ENTER_DOWN" ||
    t === "SCALE_IN"
  );
}

function iosCanonicalMotion(type: string): boolean {
  return androidCanonicalMotion(type);
}

function androidAcceptsTransition(type: string): boolean {
  return (
    type === "CUT" ||
    type === "FADE" ||
    type === "SLIDE_LEFT" ||
    type === "SLIDE_RIGHT" ||
    type === "SLIDE_UP" ||
    type === "SLIDE_DOWN"
  );
}

describe("C6 capability matrix — Transition", () => {
  for (const token of TRANSITION_TYPES_V1) {
    it(`Transition ${token}: SUPPORTED EVERYWHERE`, () => {
      expect(isTransitionTypeV1(token)).toBe(true);
      expect(normalizeTransitionV1({ type: token, durationMs: token === "CUT" ? 0 : 280 })).not.toBeNull();
      expect(studioSrc).toContain("TRANSITION_TYPES_V1");
      expect(androidAcceptsTransition(token)).toBe(true);
      // iOS: CUT/FADE exact; SLIDE_* via hasPrefix("SLIDE_") + axis check
      if (token === "CUT" || token === "FADE") {
        expect(iosSrc).toContain(`"${token}"`);
      } else {
        expect(iosSrc).toContain('hasPrefix("SLIDE_")');
        const axis = token.replace("SLIDE_", "");
        expect(iosSrc).toContain(`"${axis}"`);
      }
      const doc = createEmptyV0Document(`tr-${token}`);
      const withTr: IntroDocumentV1 = {
        ...doc,
        scenes: [{ ...doc.scenes[0]!, transition: { type: token, durationMs: token === "CUT" ? 0 : 280 } }],
      };
      expect(validateDocumentV0(normalizeDocumentV1(withTr))).toBeNull();
    });
  }
});

describe("C6 capability matrix — Motion", () => {
  for (const token of MOTION_TYPES_V1) {
    it(`Motion ${token}: SUPPORTED EVERYWHERE`, () => {
      expect(isMotionTypeV1(token)).toBe(true);
      expect(normalizeMotionV1({ type: token, startMs: 0, durationMs: token === "NONE" ? 0 : 300 })).not.toBeNull();
      expect(studioSrc).toContain("MOTION_TYPES_V1");
      expect(androidCanonicalMotion(token)).toBe(true);
      expect(iosCanonicalMotion(token)).toBe(true);
      expect(androidSrc).toContain(`"${token}"`);
      expect(iosSrc).toContain(`"${token}"`);
    });
  }

  it("SLIDE_LEFT as Motion: REJECTED BEFORE LIVE (admin/validator/native)", () => {
    expect(isMotionTypeV1("SLIDE_LEFT")).toBe(false);
    expect(normalizeMotionV1({ type: "SLIDE_LEFT", startMs: 0, durationMs: 300 })).toBeNull();
    expect(androidCanonicalMotion("SLIDE_LEFT")).toBe(false);
    expect(iosCanonicalMotion("SLIDE_LEFT")).toBe(false);
    // Native must not map SLIDE_LEFT → ENTER_LEFT anymore
    expect(androidSrc).not.toMatch(/case "SLIDE_LEFT":\s*\n\s*case "SLIDE_IN_LEFT":\s*\n\s*return "ENTER_LEFT"/);
    expect(iosSrc).not.toMatch(/case "SLIDE_LEFT", "SLIDE_IN_LEFT": return "ENTER_LEFT"/);
    const doc = createEmptyV0Document("slide-as-motion");
    const el = doc.scenes[0]!.elements[0]!;
    const bad: IntroDocumentV1 = {
      ...doc,
      scenes: [
        {
          ...doc.scenes[0]!,
          elements: [
            {
              ...el,
              motion: { type: "SLIDE_LEFT" as MotionTypeV1, startMs: 0, durationMs: 300 },
            },
          ],
        },
      ],
    };
    const afterNorm = normalizeDocumentV1(bad);
    expect(validateDocumentV0(afterNorm)).toBe("invalid_motion:SLIDE_LEFT");
  });

  it("Android/iOS reject unsupported motion (no silent NONE)", () => {
    expect(androidSrc).toContain('UNSUPPORTED_MOTION:" + motionType');
    expect(iosSrc).toContain('UNSUPPORTED_MOTION:\\(motionType)');
    // Old silent NONE path must not remain on fail branch
    expect(androidSrc).not.toMatch(
      /if \(!isCanonicalMotionType\(motionType\)\) \{\s*motionType = "NONE"/,
    );
  });
});
