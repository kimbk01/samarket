import { describe, expect, it } from "vitest";
import { isHeicOrHeifBuffer, isHeicOrHeifMime } from "@/lib/media/heic-decode.server";
import { CANONICAL_POST_IMAGE_ALLOWED_MIMES } from "@/lib/media/canonical-image-contract";

describe("heic-decode policy", () => {
  it("isHeicOrHeifMime", () => {
    expect(isHeicOrHeifMime("image/heic")).toBe(true);
    expect(isHeicOrHeifMime("image/heif")).toBe(true);
    expect(isHeicOrHeifMime("image/jpeg")).toBe(false);
  });

  it("isHeicOrHeifBuffer — ftyp heic brand", () => {
    const buf = Buffer.alloc(16);
    buf.write("....", 0);
    buf.write("ftyp", 4);
    buf.write("heic", 8);
    expect(isHeicOrHeifBuffer(buf)).toBe(true);
  });

  it("post-images allowed mimes include HEIC/HEIF", () => {
    expect(CANONICAL_POST_IMAGE_ALLOWED_MIMES).toContain("image/heic");
    expect(CANONICAL_POST_IMAGE_ALLOWED_MIMES).toContain("image/heif");
  });
});
