import { describe, expect, it } from "vitest";
import {
  createEmptyV0Document,
  isMotionTypeV1,
  normalizeDocumentV1,
  normalizeTransitionV1,
  validateDocumentV0,
  type IntroDocumentV1,
  type MotionTypeV1,
} from "@/lib/intro/contracts/document";

describe("intro document validation — capability SSOT", () => {
  it("accepts canonical empty document", () => {
    expect(validateDocumentV0(createEmptyV0Document("Grand Opening"))).toBeNull();
  });

  it("rejects missing title", () => {
    const doc = createEmptyV0Document("x");
    const bad = { ...doc, title: "   " } as IntroDocumentV1;
    expect(validateDocumentV0(bad)).toBe("missing_title");
  });

  it("rejects invalid motion types (e.g. SLIDE_LEFT) fail-closed before normalize", () => {
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

  it("normalize keeps SLIDE_LEFT motion illegal — reject before Live (no ENTER_* launder)", () => {
    const doc = createEmptyV0Document("Normalize");
    const el = doc.scenes[0]!.elements[0]!;
    const dirty: IntroDocumentV1 = {
      ...doc,
      scenes: [
        {
          ...doc.scenes[0]!,
          transition: { type: "SLIDE", durationMs: 280, direction: "LEFT" } as never,
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
    const clean = normalizeDocumentV1(dirty);
    // Transition SLIDE+direction → legal SLIDE_LEFT transition.
    expect(clean.scenes[0]!.transition).toEqual({
      type: "SLIDE_LEFT",
      durationMs: 280,
    });
    // Motion SLIDE_LEFT must NOT become ENTER_LEFT or NONE — validator fail-closes.
    expect(clean.scenes[0]!.elements[0]!.motion.type).toBe("SLIDE_LEFT");
    expect(validateDocumentV0(clean)).toBe("invalid_motion:SLIDE_LEFT");
  });

  it("accepts flat SLIDE_LEFT transition (not element motion)", () => {
    const doc = createEmptyV0Document("Transition check");
    const ok: IntroDocumentV1 = {
      ...doc,
      scenes: [
        {
          ...doc.scenes[0]!,
          transition: { type: "SLIDE_LEFT", durationMs: 280 },
        },
      ],
    };
    expect(validateDocumentV0(ok)).toBeNull();
    expect(normalizeTransitionV1({ type: "SLIDE", direction: "UP", durationMs: 200 })).toEqual({
      type: "SLIDE_UP",
      durationMs: 200,
    });
  });

  it("ADMIN GENERATED → CANONICAL VALID after normalize (UI invariant)", () => {
    const base = createEmptyV0Document("Operator Draft");
    const scene0 = base.scenes[0]!;
    const crafted: IntroDocumentV1 = {
      ...base,
      scenes: [
        {
          ...scene0,
          name: "오프닝",
          transition: { type: "FADE", durationMs: 320 },
          elements: [
            {
              ...scene0.elements[0]!,
              type: "IMAGE",
              frame: { x: 0.09, y: 0.225, w: 0.82, h: 0.55 },
              payload: { mediaId: "media-1", fit: "CONTAIN" },
              motion: { type: "FADE_IN", startMs: 0, durationMs: 400 },
            },
            {
              id: "el-text",
              type: "TEXT",
              frame: { x: 0.1, y: 0.78, w: 0.8, h: 0.08 },
              zIndex: 2,
              visible: true,
              opacity: 1,
              payload: {
                text: "디바이",
                color: "#FFFFFF",
                fontSizeNorm: 0.05,
                align: "center",
                weight: "bold",
              },
              motion: { type: "ENTER_UP", startMs: 100, durationMs: 300 },
            },
            {
              id: "el-cta",
              type: "CTA",
              frame: { x: 0.2, y: 0.88, w: 0.6, h: 0.07 },
              zIndex: 3,
              visible: true,
              opacity: 1,
              payload: {
                label: "시작하기",
                backgroundColor: "#4F46E5",
                textColor: "#FFFFFF",
                action: { type: "FINISH_INTRO" },
              },
              motion: { type: "SCALE_IN", startMs: 200, durationMs: 280 },
            },
          ],
        },
        {
          id: "scene-2",
          name: "주요 서비스",
          durationMs: 2500,
          background: { type: "COLOR", color: "#065740" },
          transition: { type: "SLIDE_LEFT", durationMs: 280 },
          elements: [
            {
              id: "el-video",
              type: "VIDEO",
              frame: { x: 0.09, y: 0.2, w: 0.82, h: 0.5 },
              zIndex: 1,
              visible: true,
              opacity: 1,
              payload: {
                mediaId: "media-v1",
                fit: "CONTAIN",
                loop: true,
                muted: true,
              },
              motion: { type: "NONE", startMs: 0, durationMs: 0 },
            },
          ],
        },
      ],
    };
    const clean = normalizeDocumentV1(crafted);
    expect(validateDocumentV0(clean)).toBeNull();
  });
});
