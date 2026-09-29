package com.dibay.app.intro;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Native Scene surface — COLOR background + TEXT/IMAGE/LOGO elements. */
public final class DibayIntroSceneSurface extends FrameLayout {
  private DibayIntroPackModel.Scene scene;
  private float compositionW = 9f;
  private float compositionH = 16f;
  private boolean painted = false;
  private Map<String, File> mediaFiles = new HashMap<>();

  public DibayIntroSceneSurface(Context context) {
    super(context);
    setClickable(true);
    setFocusable(true);
  }

  public void setMediaFiles(Map<String, File> mediaFiles) {
    this.mediaFiles = mediaFiles != null ? mediaFiles : new HashMap<>();
  }

  public void bindScene(
      DibayIntroPackModel.Scene scene, float compositionW, float compositionH) {
    this.scene = scene;
    this.compositionW = compositionW;
    this.compositionH = compositionH;
    this.painted = false;
    removeAllViews();
    if (scene == null) return;
    setBackgroundColor(scene.backgroundArgb);
    requestLayout();
    post(this::rebuildFromCurrentSize);
  }

  public boolean hasPaintedAuthoredPixels() {
    return painted;
  }

  private void rebuildFromCurrentSize() {
    int w = getWidth();
    int h = getHeight();
    if (w > 0 && h > 0 && scene != null) {
      rebuild(w, h);
    }
  }

  @Override
  protected void onSizeChanged(int w, int h, int oldw, int oldh) {
    super.onSizeChanged(w, h, oldw, oldh);
    if (w > 0 && h > 0 && scene != null) {
      rebuild(w, h);
    }
  }

  @Override
  protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
    super.onLayout(changed, left, top, right, bottom);
    if (getChildCount() > 0 && !painted && scene != null) {
      painted = true;
    }
  }

  private void rebuild(int VW, int VH) {
    removeAllViews();
    painted = false;
    if (scene == null) return;
    setBackgroundColor(scene.backgroundArgb);
    DibayIntroFitGeometry.ContentRegion region =
        DibayIntroFitGeometry.fitContentRegion(VW, VH, compositionW, compositionH);
    List<DibayIntroPackModel.Element> elements = scene.elements;
    int added = 0;
    for (DibayIntroPackModel.Element el : elements) {
      if (!el.visible) continue;
      DibayIntroFitGeometry.DeviceRect rect =
          DibayIntroFitGeometry.mapFrame(
              el.frame.x, el.frame.y, el.frame.w, el.frame.h, region);
      FrameLayout.LayoutParams lp =
          new FrameLayout.LayoutParams(
              Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
      lp.gravity = Gravity.TOP | Gravity.START;
      lp.leftMargin = Math.round(rect.left);
      lp.topMargin = Math.round(rect.top);

      if ("TEXT".equals(el.type)) {
        TextView tv = new TextView(getContext());
        tv.setText(el.text);
        tv.setTextColor(el.textColorArgb);
        float fontPx = Math.max(8f, el.fontSizeNorm * region.RH);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_PX, fontPx);
        if ("bold".equals(el.weight)) {
          tv.setTypeface(Typeface.DEFAULT_BOLD);
        }
        int gravity = Gravity.CENTER;
        if ("left".equals(el.align)) gravity = Gravity.CENTER_VERTICAL | Gravity.START;
        if ("right".equals(el.align)) gravity = Gravity.CENTER_VERTICAL | Gravity.END;
        tv.setGravity(gravity);
        tv.setAlpha(Math.max(0f, Math.min(1f, el.opacity)));
        addView(tv, lp);
        added++;
      } else if ("IMAGE".equals(el.type) || "LOGO".equals(el.type)) {
        File file = mediaFiles.get(el.mediaId);
        if (file == null || !file.isFile()) {
          Log.w("DibayIntroScene", "image_missing mediaId=" + el.mediaId);
          continue;
        }
        Bitmap bmp = BitmapFactory.decodeFile(file.getAbsolutePath());
        if (bmp == null) {
          Log.w("DibayIntroScene", "image_decode_failed mediaId=" + el.mediaId);
          continue;
        }
        ImageView iv = new ImageView(getContext());
        iv.setImageBitmap(bmp);
        if ("COVER".equals(el.fit)) {
          iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
        } else {
          iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
        }
        iv.setAlpha(Math.max(0f, Math.min(1f, el.opacity)));
        addView(iv, lp);
        added++;
      }
    }
    Log.i(
        "DibayIntroScene",
        "rebuild VW=" + VW + " VH=" + VH + " children=" + getChildCount() + " added=" + added);
    if (elements.isEmpty()) {
      painted = true;
    }
  }
}
