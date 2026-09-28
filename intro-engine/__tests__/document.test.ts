import { describe, expect, it } from "vitest";
import {
  createEmptyIntroShowDocument,
  parseIntroShowDocument,
  semanticDocumentsEqual,
  toSemanticDocument,
} from "../document";
import { DIBAY_GREEN, INTRO_SHOW_DOCUMENT_VERSION } from "../identity";

describe("intro-engine document", () => {
  it("creates one green scene with no layers", () => {
    const doc = createEmptyIntroShowDocument({ sceneId: "scene-1" });
    expect(doc.version).toBe(INTRO_SHOW_DOCUMENT_VERSION);
    expect(doc.scene.background.color).toBe(DIBAY_GREEN);
    expect(doc.scene.layers).toEqual([]);
  });

  it("rejects platform-specific fields and invalid layers", () => {
    expect(parseIntroShowDocument({ version: 1, scene: { id: "s" } })).toBeNull();
    expect(
      parseIntroShowDocument({
        version: 1,
        scene: {
          id: "s",
          durationMs: 2400,
          background: { color: DIBAY_GREEN },
          layers: [{ id: "l", type: "TEXT" }],
        },
      }),
    ).toBeNull();
  });

  it("compares semantic fields only", () => {
    const a = createEmptyIntroShowDocument({ sceneId: "scene-1" });
    const b = createEmptyIntroShowDocument({ sceneId: "scene-1" });
    a.scene.layers.push({
      id: "logo",
      type: "LOGO",
      frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.2 },
      zIndex: 2,
      visible: true,
      opacity: 1,
      mediaId: "media-logo",
      fit: "contain",
    });
    b.scene.layers.push({
      id: "logo",
      type: "LOGO",
      frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.2 },
      zIndex: 2,
      visible: true,
      opacity: 1,
      mediaId: "media-logo",
      fit: "contain",
    });
    expect(semanticDocumentsEqual(a, b)).toBe(true);
    expect(toSemanticDocument(a).layers[0]?.x).toBe(0.2);
  });
});
