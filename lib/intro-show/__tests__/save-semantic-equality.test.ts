import { describe, expect, it } from "vitest";
import {
  canonicalDocumentJson,
  createEmptyIntroShowDocument,
  parseIntroShowDocument,
  semanticDocumentsEqual,
} from "@/intro-engine";

describe("intro show save semantic equality", () => {
  it("round-trips working document through JSON without semantic drift", () => {
    const working = createEmptyIntroShowDocument({ sceneId: "scene-1" });
    working.scene.layers.push({
      id: "logo-1",
      type: "LOGO",
      frame: { x: 0.25, y: 0.22, width: 0.5, height: 0.22 },
      zIndex: 2,
      visible: true,
      opacity: 1,
      mediaId: "media-logo",
      fit: "contain",
    });
    working.scene.layers.push({
      id: "image-1",
      type: "IMAGE",
      frame: { x: 0.12, y: 0.48, width: 0.76, height: 0.38 },
      zIndex: 1,
      visible: true,
      opacity: 1,
      mediaId: "media-image",
      fit: "cover",
    });
    const request = JSON.stringify(working);
    const stored = parseIntroShowDocument(JSON.parse(request));
    expect(stored).not.toBeNull();
    expect(semanticDocumentsEqual(working, stored!)).toBe(true);
    expect(canonicalDocumentJson(stored!)).toBe(canonicalDocumentJson(working));
  });
});
