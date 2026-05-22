import { describe, expect, it } from "vitest";
import {
  inferOwnerProductImageMimeFromFileName,
  OWNER_PRODUCT_IMAGE_MAX_EDGE_PX,
  OWNER_PRODUCT_IMAGE_RECOMMENDED_EDGE_PX,
  OWNER_PRODUCT_IMAGE_STORE_MAX_EDGE_PX,
  parseThumbnailDimensions,
  resolveOwnerProductImageMime,
  validateOwnerProductImagePixelDimensions,
} from "@/lib/stores/owner-product-images";

describe("validateOwnerProductImagePixelDimensions", () => {
  it("allows 512×512 (recommended) and larger up to max edge", () => {
    expect(validateOwnerProductImagePixelDimensions(512, 512)).toEqual({ ok: true });
    expect(validateOwnerProductImagePixelDimensions(1024, 768)).toEqual({ ok: true });
    expect(
      validateOwnerProductImagePixelDimensions(
        OWNER_PRODUCT_IMAGE_MAX_EDGE_PX,
        OWNER_PRODUCT_IMAGE_MAX_EDGE_PX
      )
    ).toEqual({ ok: true });
  });

  it("allows smaller than recommended (no minimum)", () => {
    expect(validateOwnerProductImagePixelDimensions(256, 256)).toEqual({ ok: true });
  });

  it("rejects edges above max", () => {
    expect(
      validateOwnerProductImagePixelDimensions(OWNER_PRODUCT_IMAGE_MAX_EDGE_PX + 1, 100)
    ).toEqual({ ok: false, error: "image_dimension_too_large" });
  });

  it("documents store pipeline cap above recommended", () => {
    expect(OWNER_PRODUCT_IMAGE_RECOMMENDED_EDGE_PX).toBe(512);
    expect(OWNER_PRODUCT_IMAGE_STORE_MAX_EDGE_PX).toBeGreaterThan(
      OWNER_PRODUCT_IMAGE_RECOMMENDED_EDGE_PX
    );
  });

  it("parseThumbnailDimensions floors non-integer pixels (512+ saves)", () => {
    expect(parseThumbnailDimensions(1024.8, 2048.2)).toEqual({
      ok: true,
      dims: { width: 1024, height: 2048 },
    });
  });

  it("resolveOwnerProductImageMime when file.type is empty", () => {
    const f = new File([new Uint8Array([0xff, 0xd8, 0xff])], "menu.jpg", { type: "" });
    expect(resolveOwnerProductImageMime(f)).toBe("image/jpeg");
    expect(inferOwnerProductImageMimeFromFileName("photo.PNG")).toBe("image/png");
  });
});
