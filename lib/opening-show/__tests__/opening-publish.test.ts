import { describe, expect, it } from "vitest";
import { openingManifestChecksum, sha256Hex } from "@/lib/opening-show/sha256";
import {
  openingPublishFailCopy,
  validateOpeningDocumentForPublish,
} from "@/lib/opening-show/publish-validate";
import { createEmptyOpeningDocument } from "@/lib/opening-show/document";

describe("validateOpeningDocumentForPublish", () => {
  it("rejects empty scenes", () => {
    const result = validateOpeningDocumentForPublish({ version: 1, scenes: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_scene");
  });

  it("rejects unsupported version", () => {
    const result = validateOpeningDocumentForPublish({ version: 9, scenes: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsupported_version");
  });

  it("rejects a scene with no visible image", () => {
    const document = createEmptyOpeningDocument();
    const result = validateOpeningDocumentForPublish(document);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_scene");
  });

  it("accepts a visible image layer and lists its media", () => {
    const result = validateOpeningDocumentForPublish({
      version: 1,
      scenes: [
        {
          id: "scene-1",
          background: { color: "#0B421A" },
          layers: [
            {
              id: "layer-1",
              type: "image",
              mediaId: "media-1",
              frame: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
              fit: "cover",
              zIndex: 0,
              visible: true,
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mediaIds).toEqual(["media-1"]);
  });

  it("returns human copy, not raw codes", () => {
    expect(openingPublishFailCopy("no_scene").fallbackKo).not.toMatch(/no_scene/);
  });
});

describe("openingManifestChecksum", () => {
  it("is stable after asset order shuffle", () => {
    const a = openingManifestChecksum({ revisionId: "r1", assetSha256: ["bb", "aa"] });
    const b = openingManifestChecksum({ revisionId: "r1", assetSha256: ["aa", "bb"] });
    expect(a).toBe(b);
    expect(a).toBe(sha256Hex(Buffer.from("r1:aa,bb", "utf8")));
  });
});
