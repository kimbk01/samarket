import { describe, expect, it } from "vitest";
import {
  createEmptyV0Document,
  isMotionTypeV1,
  validateDocumentV0,
  type IntroDocumentV1,
  type MotionTypeV1,
} from "@/lib/intro/contracts/document";

describe("intro document validation — ONE CORRECTION BATCH", () => {
  it("accepts canonical empty document", () => {
    expect(validateDocumentV0(createEmptyV0Document("Grand Opening"))).toBeNull();
  });

  it("rejects missing title", () => {
    const doc = createEmptyV0Document("x");
    const bad = { ...doc, title: "   " } as IntroDocumentV1;
    expect(validateDocumentV0(bad)).toBe("missing_title");
  });

  it("rejects invalid motion types (e.g. SLIDE_LEFT) fail-closed", () => {
    expect(isMotionTypeV1("SLIDE_LEFT")).toBe(false);
    expect(isMotionTypeV1("ENTER_LEFT")).toBe(true);
    const doc = createEmptyV0Document("Motion check");
    const el = doc.scenes[0]!.elements[0]!;
    const bad: IntroDocumentV1 = {
      ...doc,
      scenes: [
        {
          ...doc.scenes[0]!,
          elements: [
            {
              ...el,
              motion: {
                type: "SLIDE_LEFT" as MotionTypeV1,
                startMs: 0,
                durationMs: 300,
              },
            },
          ],
        },
      ],
    };
    expect(validateDocumentV0(bad)).toBe("invalid_motion:SLIDE_LEFT");
  });

  it("accepts SLIDE transition with direction (not element motion)", () => {
    const doc = createEmptyV0Document("Transition check");
    const ok: IntroDocumentV1 = {
      ...doc,
      scenes: [
        {
          ...doc.scenes[0]!,
          transition: { type: "SLIDE", durationMs: 280, direction: "LEFT" },
        },
      ],
    };
    expect(validateDocumentV0(ok)).toBeNull();
  });
});
