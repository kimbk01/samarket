package com.dibay.app.intro;

/**
 * Geometry SSOT — identical algorithm to lib/intro/geometry/fit.ts
 * Letterbox FIT: entire 9:16 composition visible; no crop.
 */
public final class DibayIntroFitGeometry {
  public static final float CANONICAL_W = 9f;
  public static final float CANONICAL_H = 16f;

  public static final class ContentRegion {
    public final float OX;
    public final float OY;
    public final float RW;
    public final float RH;

    public ContentRegion(float OX, float OY, float RW, float RH) {
      this.OX = OX;
      this.OY = OY;
      this.RW = RW;
      this.RH = RH;
    }
  }

  public static final class DeviceRect {
    public final float left;
    public final float top;
    public final float width;
    public final float height;

    public DeviceRect(float left, float top, float width, float height) {
      this.left = left;
      this.top = top;
      this.width = width;
      this.height = height;
    }
  }

  private DibayIntroFitGeometry() {}

  public static ContentRegion fitContentRegion(
      float viewportW, float viewportH, float aspectW, float aspectH) {
    float VW = Math.max(1f, viewportW);
    float VH = Math.max(1f, viewportH);
    float target = aspectW / aspectH;
    float view = VW / VH;
    float RW;
    float RH;
    if (view > target) {
      RH = VH;
      RW = VH * target;
    } else {
      RW = VW;
      RH = VW / target;
    }
    return new ContentRegion((VW - RW) / 2f, (VH - RH) / 2f, RW, RH);
  }

  public static DeviceRect mapFrame(
      float x, float y, float w, float h, ContentRegion region) {
    return new DeviceRect(
        region.OX + x * region.RW,
        region.OY + y * region.RH,
        w * region.RW,
        h * region.RH);
  }
}
