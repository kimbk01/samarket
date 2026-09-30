package com.dibay.app.intro;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.util.Log;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.ImageView;
import java.io.File;

/**
 * Layer B System Start surface — full-screen bg color, optional cover bg image,
 * brand logo at normalized center/size.
 */
public final class DibaySystemStartSurface extends FrameLayout {
  public static final String TAG = "DibaySystemStartSurface";

  private DibaySystemStartConfig config;
  private File verifiedRoot;
  private boolean painted = false;

  public DibaySystemStartSurface(Context context) {
    super(context);
    setClickable(true);
    setFocusable(true);
  }

  public void bind(DibaySystemStartConfig config, File verifiedRoot) {
    this.config = config;
    this.verifiedRoot = verifiedRoot;
    this.painted = false;
    removeAllViews();
    if (config == null) {
      setBackgroundColor(Color.parseColor("#FFFCFC"));
      return;
    }
    setBackgroundColor(config.backgroundArgb);
    requestLayout();
    post(this::rebuildFromCurrentSize);
  }

  public int backgroundArgbOrCream() {
    if (config != null) return config.backgroundArgb;
    return Color.parseColor("#FFFCFC");
  }

  public int minVisibleMs() {
    return config != null ? config.minVisibleMs : 500;
  }

  public boolean hasPainted() {
    return painted;
  }

  private void rebuildFromCurrentSize() {
    int w = getWidth();
    int h = getHeight();
    if (w > 0 && h > 0 && config != null) {
      rebuild(w, h);
    }
  }

  @Override
  protected void onSizeChanged(int w, int h, int oldw, int oldh) {
    super.onSizeChanged(w, h, oldw, oldh);
    if (w > 0 && h > 0 && config != null) {
      rebuild(w, h);
    }
  }

  @Override
  protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
    super.onLayout(changed, left, top, right, bottom);
    if (!painted && config != null) {
      painted = true;
    }
  }

  private void rebuild(int VW, int VH) {
    removeAllViews();
    painted = false;
    if (config == null) return;
    setBackgroundColor(config.backgroundArgb);

    DibaySystemStartConfig.FileRef bg = config.resolveBackgroundImage(verifiedRoot);
    if (bg != null) {
      Bitmap bmp = BitmapFactory.decodeFile(bg.file.getAbsolutePath());
      if (bmp != null) {
        ImageView bgIv = new ImageView(getContext());
        bgIv.setImageBitmap(bmp);
        bgIv.setScaleType(ImageView.ScaleType.CENTER_CROP);
        addView(
            bgIv,
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
      } else {
        Log.w(TAG, "bg_image_decode_failed");
      }
    }

    DibaySystemStartConfig.FileRef brand = config.resolveBrandImage(verifiedRoot);
    if (brand != null) {
      Bitmap bmp = BitmapFactory.decodeFile(brand.file.getAbsolutePath());
      if (bmp != null) {
        float sizeNorm = Math.max(0.05f, Math.min(1f, config.brandSizeNorm));
        int brandW = Math.max(1, Math.round(VW * sizeNorm));
        int brandH = Math.max(1, Math.round(VH * sizeNorm));
        float cx = Math.max(0f, Math.min(1f, config.brandXNorm)) * VW;
        float cy = Math.max(0f, Math.min(1f, config.brandYNorm)) * VH;
        ImageView iv = new ImageView(getContext());
        iv.setImageBitmap(bmp);
        iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(brandW, brandH);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.leftMargin = Math.round(cx - brandW / 2f);
        lp.topMargin = Math.round(cy - brandH / 2f);
        addView(iv, lp);
      } else {
        Log.w(TAG, "brand_decode_failed");
      }
    }
    painted = true;
    Log.i(TAG, "rebuild VW=" + VW + " VH=" + VH + " children=" + getChildCount());
  }
}
