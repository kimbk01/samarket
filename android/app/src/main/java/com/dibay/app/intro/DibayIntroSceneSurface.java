package com.dibay.app.intro;

import android.animation.ObjectAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Typeface;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Native Scene surface — COLOR background + TEXT/IMAGE/LOGO/CTA + element motion. */
public final class DibayIntroSceneSurface extends FrameLayout {
  public interface CtaListener {
    void onCta(String actionType, String destination);
  }

  private DibayIntroPackModel.Scene scene;
  private float compositionW = 9f;
  private float compositionH = 16f;
  private boolean painted = false;
  private Map<String, File> mediaFiles = new HashMap<>();
  private CtaListener ctaListener;

  public DibayIntroSceneSurface(Context context) {
    super(context);
    setClickable(true);
    setFocusable(true);
  }

  public void setMediaFiles(Map<String, File> mediaFiles) {
    this.mediaFiles = mediaFiles != null ? mediaFiles : new HashMap<>();
  }

  public void setCtaListener(CtaListener listener) {
    this.ctaListener = listener;
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

      View child = null;
      if ("TEXT".equals(el.type)) {
        TextView tv = new TextView(getContext());
        tv.setText(el.text);
        tv.setTextColor(el.textColorArgb);
        float fontPx = Math.max(8f, el.fontSizeNorm * region.RH);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_PX, fontPx);
        if ("bold".equals(el.weight)) {
          tv.setTypeface(Typeface.DEFAULT_BOLD);
        } else if ("medium".equals(el.weight)) {
          tv.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.NORMAL));
        }
        int gravity = Gravity.CENTER;
        if ("left".equals(el.align)) gravity = Gravity.CENTER_VERTICAL | Gravity.START;
        if ("right".equals(el.align)) gravity = Gravity.CENTER_VERTICAL | Gravity.END;
        tv.setGravity(gravity);
        tv.setAlpha(Math.max(0f, Math.min(1f, el.opacity)));
        child = tv;
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
        child = iv;
      } else if ("CTA".equals(el.type)) {
        TextView btn = new TextView(getContext());
        btn.setText(el.ctaLabel);
        btn.setTextColor(el.ctaTextArgb);
        btn.setBackgroundColor(el.ctaBgArgb);
        btn.setGravity(Gravity.CENTER);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        float fontPx = Math.max(12f, 0.035f * region.RH);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_PX, fontPx);
        btn.setAlpha(Math.max(0f, Math.min(1f, el.opacity)));
        final String actionType = el.ctaActionType;
        final String destination = el.ctaDestination;
        btn.setOnClickListener(
            v -> {
              if (ctaListener != null) ctaListener.onCta(actionType, destination);
            });
        child = btn;
      }
      if (child == null) continue;
      addView(child, lp);
      applyMotion(child, el, region);
      added++;
    }
    Log.i(
        "DibayIntroScene",
        "rebuild VW=" + VW + " VH=" + VH + " children=" + getChildCount() + " added=" + added);
    if (elements.isEmpty()) {
      painted = true;
    }
  }

  private void applyMotion(
      View view, DibayIntroPackModel.Element el, DibayIntroFitGeometry.ContentRegion region) {
    String type = el.motionType != null ? el.motionType : "NONE";
    if ("NONE".equals(type) || el.motionDurationMs <= 0) return;
    long start = Math.max(0, el.motionStartMs);
    long dur = Math.max(1, el.motionDurationMs);
    float distX = region.RW * 0.25f;
    float distY = region.RH * 0.25f;
    switch (type) {
      case "FADE_IN": {
        view.setAlpha(0f);
        ObjectAnimator a = ObjectAnimator.ofFloat(view, View.ALPHA, 0f, el.opacity);
        a.setStartDelay(start);
        a.setDuration(dur);
        a.start();
        break;
      }
      case "ENTER_TOP":
        view.setTranslationY(-distY);
        view.animate().translationY(0).setStartDelay(start).setDuration(dur).start();
        break;
      case "ENTER_BOTTOM":
        view.setTranslationY(distY);
        view.animate().translationY(0).setStartDelay(start).setDuration(dur).start();
        break;
      case "ENTER_LEFT":
        view.setTranslationX(-distX);
        view.animate().translationX(0).setStartDelay(start).setDuration(dur).start();
        break;
      case "ENTER_RIGHT":
        view.setTranslationX(distX);
        view.animate().translationX(0).setStartDelay(start).setDuration(dur).start();
        break;
      case "SCALE_IN":
        view.setScaleX(0.7f);
        view.setScaleY(0.7f);
        view.animate().scaleX(1f).scaleY(1f).setStartDelay(start).setDuration(dur).start();
        break;
      default:
        break;
    }
  }
}
