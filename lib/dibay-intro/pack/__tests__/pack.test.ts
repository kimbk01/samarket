import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { threeSceneAcceptanceDocument, ACCEPTANCE_MEDIA_IMAGE, ACCEPTANCE_MEDIA_LOGO } from "@/lib/dibay-intro/__tests__/three-scene-fixture";
import { buildSealedIntroPack } from "@/lib/dibay-intro/pack/build-pack";
import { parseIntroPackManifest } from "@/lib/dibay-intro/pack/manifest";
import { createBootstrapTraceBuffer } from "@/lib/dibay-intro/pack/bootstrap";
import { DIBAY_INTRO_ALLOWED_MIME } from "@/lib/dibay-intro/media-process";

describe("sealed intro pack", () => {
  it("contains engine document media gif runtime fonts manifest and READY", () => {
    const gif = Buffer.from("GIF89a-animated-fixture");
    const png = Buffer.from("png-bytes");
    const packed = buildSealedIntroPack({
      introId: "intro-1",
      revisionId: "rev-1",
      document: threeSceneAcceptanceDocument(),
      engineJs: Buffer.from("window.__engine=1;", "utf8"),
      engineHash: "abc",
      fontBytes: Buffer.from("woff2"),
      media: [
        {
          id: ACCEPTANCE_MEDIA_LOGO,
          mime: "image/png",
          animated: false,
          bytes: png,
          ext: "png",
        },
        {
          id: ACCEPTANCE_MEDIA_IMAGE,
          mime: "image/gif",
          animated: true,
          bytes: gif,
          ext: "gif",
        },
      ],
    });
    expect(packed.files.has("engine.js")).toBe(true);
    expect(packed.files.has("document.json")).toBe(true);
    expect(packed.files.has("manifest.json")).toBe(true);
    expect(packed.files.has("READY")).toBe(true);
    expect(packed.files.has("fonts/PretendardVariable.woff2")).toBe(true);
    expect(packed.files.has(`media/${ACCEPTANCE_MEDIA_IMAGE}.gif`)).toBe(true);
    expect(packed.files.get(`media/${ACCEPTANCE_MEDIA_IMAGE}.gif`)?.equals(gif)).toBe(true);
    const parsed = parseIntroPackManifest(JSON.parse(packed.files.get("manifest.json")!.toString("utf8")));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.manifest.completeness).toBe("READY");
      expect(parsed.manifest.media.some((m) => m.animated && m.file.endsWith(".gif"))).toBe(true);
    }
  });
});

describe("bootstrap traces", () => {
  it("preserves the first exact failure", () => {
    const buf = createBootstrapTraceBuffer();
    buf.emit("PACK_OPEN", "BEGIN");
    buf.emit("PACK_OPEN", "PASS");
    buf.emit("MANIFEST_READ", "FAIL", "missing_manifest");
    buf.emit("ENGINE_VERIFY", "FAIL", "later");
    expect(buf.firstFailure()?.reason).toBe("missing_manifest");
    expect(buf.firstFailure()?.step).toBe("MANIFEST_READ");
  });
});

describe("gif pipeline", () => {
  it("keeps gif as gif and never converts to webp in the media processor", () => {
    const src = readFileSync("lib/dibay-intro/media-process.ts", "utf8");
    expect(src).toContain("Never convert to still WebP");
    expect(src).toContain("GIF runtime asset must remain the original animated bytes");
    expect(DIBAY_INTRO_ALLOWED_MIME["image/gif"]).toBe("gif");
  });
});
