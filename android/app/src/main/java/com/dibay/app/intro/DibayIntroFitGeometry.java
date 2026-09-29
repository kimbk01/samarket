package com.dibay.app.intro;

/**
 * Gate B FIT geometry — positioned content only.
 * scale = min(VW/CaW, VH/CaH); no positioned COVER.
 */
public final class DibayIntroFitGeometry {
  public static final float CANONICAL_W = 9f;
  public static final float CANONICAL_H = 16f;

  public static final class ContentRegion {
    public final float RW;
    public final float RH;
    public final float OX;
    public final float OY;

    public ContentRegion(float RW, float RH, float OX, float OY) {
      this.RW = RW;
      this.RH = RH;
      this.OX = OX;
      this.OY = OY;
    }
  }

  public static final class DeviceRect {
    public final float vx;
    public final float vy;
    public final float vw;
    public final float vh;

    public DeviceRect(float vx, float vy, float vw, float vh) {
      this.vx = vx;
      this.vy = vy;
      this.vw = vw;
      this.vh = vh;
    }
  }

  public static ContentRegion fitContentRegion(float VW, float VH, float CaW, float CaH) {
    float scale = Math.min(VW / CaW, VH / CaH);
    float RW = CaW * scale;
    float RH = CaH * scale;
    float OX = (VW - RW) / 2f;
    float OY = (VH - RH) / 2f;
    return new ContentRegion(RW, RH, OX, OY);
  }

  public static DeviceRect mapFrame(
      float x, float y, float w, float h, ContentRegion region) {
    return new DeviceRect(
        region.OX + x * region.RW,
        region.OY + y * region.RH,
        w * region.RW,
        h * region.RH);
  }

  private DibayIntroFitGeometry() {}
}
