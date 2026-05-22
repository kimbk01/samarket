import { describe, expect, it } from "vitest";
import {
  OWNER_PRODUCT_IMAGE_MAX_EDGE_PX,
  OWNER_PRODUCT_IMAGE_RECOMMENDED_EDGE_PX,
  OWNER_PRODUCT_IMAGE_STORE_MAX_EDGE_PX,
} from "@/lib/stores/owner-product-images";
import { validateOwnerProductImagePixelDimensions } from "@/lib/stores/owner-product-images";

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
});
