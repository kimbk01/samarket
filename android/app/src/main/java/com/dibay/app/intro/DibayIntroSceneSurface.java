package com.dibay.app.intro;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import java.io.File;
import java.util.HashMap;
import java.util.Map;

/**
 * Native declarative scene surface — Pack layers → Android view hierarchy.
 * Gate B FIT for positioned content. Local sealed media only.
 */
public final class DibayIntroSceneSurface extends FrameLayout {
  private final File assetsRoot;
  private final File fontsRoot;
  private final Map<String, Typeface> typefaceCache = new HashMap<>();
  private DibayIntroPackModel.Scene scene;
  private float compositionW = 9f;
  private float compositionH = 16f;
  private boolean painted = false;

  public DibayIntroSceneSurface(Context context, File assetsRoot, File fontsRoot) {
    super(context);
    this.assetsRoot = assetsRoot;
    this.fontsRoot = fontsRoot;
    setClickable(true);
    setFocusable(true);
  }

  public void bindScene(DibayIntroPackModel.Scene scene, float compositionW, float compositionH) {
    this.scene = scene;
    this.compositionW = compositionW;
    this.compositionH = compositionH;
    this.painted = false;
    removeAllViews();
    if (scene == null) return;
    setBackgroundColor(scene.backgroundArgb);
    Log.i(
        "DibayIntroScene",
        "bindScene sceneId="
            + scene.sceneId
            + " layers="
            + scene.layers.size()
            + " w="
            + getWidth()
            + " h="
            + getHeight());
    // Always schedule rebuild after layout — onSizeChanged may have already
    // fired before scene was bound (same size → no second callback).
    requestLayout();
    post(this::rebuildFromCurrentSize);
  }

  private void rebuildFromCurrentSize() {
    int w = getWidth();
    int h = getHeight();
    if (w > 0 && h > 0 && scene != null) {
      rebuildLayers(w, h);
    }
  }

  public boolean hasPaintedAuthoredPixels() {
    return painted;
  }

  @Override
  protected void onSizeChanged(int w, int h, int oldw, int oldh) {
    super.onSizeChanged(w, h, oldw, oldh);
    if (w > 0 && h > 0 && scene != null) {
      rebuildLayers(w, h);
    }
  }

  @Override
  protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
    super.onLayout(changed, left, top, right, bottom);
    if (getChildCount() > 0 && !painted && scene != null) {
      painted = true;
    }
  }

  private void rebuildLayers(int VW, int VH) {
    removeAllViews();
    painted = false;
    if (scene == null) return;
    setBackgroundColor(scene.backgroundArgb);
    DibayIntroFitGeometry.ContentRegion region =
        DibayIntroFitGeometry.fitContentRegion(VW, VH, compositionW, compositionH);
    int added = 0;
    for (DibayIntroPackModel.Layer layer : scene.layers) {
      if (!layer.visible) continue;
      View child = buildLayerView(layer, region, VH);
      if (child == null) {
        Log.w("DibayIntroScene", "layer_skip_null type=" + layer.type + " id=" + layer.layerId);
        continue;
      }
      DibayIntroFitGeometry.DeviceRect rect =
          DibayIntroFitGeometry.mapFrame(
              layer.frame.x, layer.frame.y, layer.frame.w, layer.frame.h, region);
      int childW = Math.max(1, Math.round(rect.vw));
      int childH = Math.max(1, Math.round(rect.vh));
      FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(childW, childH);
      lp.gravity = Gravity.TOP | Gravity.START;
      lp.leftMargin = Math.round(rect.vx);
      lp.topMargin = Math.round(rect.vy);
      child.setAlpha(Math.max(0f, Math.min(1f, layer.opacity)));
      addView(child, lp);
      added++;
      Log.i(
          "DibayIntroScene",
          "layer_added type="
              + layer.type
              + " text="
              + (layer.textContent != null ? layer.textContent : layer.ctaLabel)
              + " frame="
              + lp.leftMargin
              + ","
              + lp.topMargin
              + ","
              + childW
              + "x"
              + childH
              + " color=0x"
              + Integer.toHexString(layer.colorArgb)
              + " ctaBg=0x"
              + Integer.toHexString(layer.ctaBgArgb));
    }
    Log.i(
        "DibayIntroScene",
        "rebuild_done VW=" + VW + " VH=" + VH + " children=" + getChildCount() + " added=" + added);
    // Empty scene (black only) is still authored pixels once laid out.
    if (scene.layers.isEmpty()) {
      painted = true;
    }
  }

  private View buildLayerView(
      DibayIntroPackModel.Layer layer,
      DibayIntroFitGeometry.ContentRegion region,
      int viewportH) {
    switch (layer.type) {
      case "IMAGE":
      case "LOGO":
        return buildImage(layer);
      case "TEXT":
        return buildText(layer, region, viewportH);
      case "CTA":
        return buildCta(layer, region, viewportH);
      default:
        return null;
    }
  }

  private View buildImage(DibayIntroPackModel.Layer layer) {
    ImageView iv = new ImageView(getContext());
    iv.setScaleType(
        "COVER".equals(layer.fit) ? ImageView.ScaleType.CENTER_CROP : ImageView.ScaleType.FIT_CENTER);
    // Local media lookup is owned by RuntimeController (verified before bind).
    Object tag = layer.mediaRefId;
    iv.setTag(tag);
    File file = resolveMediaFile(layer.mediaRefId);
    if (file != null && file.isFile()) {
      Bitmap bmp = BitmapFactory.decodeFile(file.getAbsolutePath());
      if (bmp != null) iv.setImageBitmap(bmp);
    }
    return iv;
  }

  private View buildText(
      DibayIntroPackModel.Layer layer,
      DibayIntroFitGeometry.ContentRegion region,
      int viewportH) {
    TextView tv = new TextView(getContext());
    tv.setText(layer.textContent != null ? layer.textContent : "");
    tv.setTextColor(layer.colorArgb);
    tv.setGravity(gravityForAlign(layer.align) | Gravity.CENTER_VERTICAL);
    tv.setMaxLines(Math.max(1, layer.maxLines));
    float px = layer.fontSize * region.RH;
    tv.setTextSize(TypedValue.COMPLEX_UNIT_PX, px);
    tv.setLineSpacing(0f, layer.lineHeight > 0 ? layer.lineHeight : 1.25f);
    Typeface tf = loadTypeface(layer.fontAssetId);
    if (tf != null) tv.setTypeface(tf);
    tv.setIncludeFontPadding(false);
    return tv;
  }

  private View buildCta(
      DibayIntroPackModel.Layer layer,
      DibayIntroFitGeometry.ContentRegion region,
      int viewportH) {
    TextView tv = new TextView(getContext());
    tv.setText(layer.ctaLabel != null ? layer.ctaLabel : "");
    tv.setTextColor(layer.colorArgb);
    tv.setGravity(Gravity.CENTER);
    float px = layer.fontSize * region.RH;
    tv.setTextSize(TypedValue.COMPLEX_UNIT_PX, px);
    Typeface tf = loadTypeface(layer.fontAssetId);
    if (tf != null) tv.setTypeface(tf);
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(layer.ctaBgArgb);
    float radiusPx = layer.ctaCornerRadius * region.RW;
    bg.setCornerRadius(radiusPx);
    tv.setBackground(bg);
    // Visual only for V3 — interaction NOT_PROVEN unless exercised.
    tv.setClickable(false);
    return tv;
  }

  private int gravityForAlign(String align) {
    if ("LEFT".equals(align)) return Gravity.START;
    if ("RIGHT".equals(align)) return Gravity.END;
    return Gravity.CENTER_HORIZONTAL;
  }

  private Typeface loadTypeface(String assetId) {
    if (assetId == null || assetId.isEmpty()) return null;
    Typeface cached = typefaceCache.get(assetId);
    if (cached != null) return cached;
    File f = new File(fontsRoot, assetId);
    if (!f.isFile()) return null;
    Typeface tf = Typeface.createFromFile(f);
    typefaceCache.put(assetId, tf);
    return tf;
  }

  private File resolveMediaFile(String mediaRefId) {
    if (mediaRefId == null || assetsRoot == null) return null;
    Object pathTag = getTag();
    // Runtime attaches absolute path map via setMediaPathResolver
    if (mediaPathResolver != null) {
      return mediaPathResolver.resolve(mediaRefId);
    }
    return null;
  }

  public interface MediaPathResolver {
    File resolve(String mediaRefId);
  }

  private MediaPathResolver mediaPathResolver;

  public void setMediaPathResolver(MediaPathResolver resolver) {
    this.mediaPathResolver = resolver;
  }
}
