package com.dibay.app.opening;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

final class OpeningPlayerSurface {
  private static final String TAG = "OpeningPlayer";
  private static final int VIEW_ID = 0x6F706E31;
  private static volatile boolean showing = false;

  private OpeningPlayerSurface() {}

  static boolean isShowing() {
    return showing;
  }

  static void present(Activity activity, JSONObject manifest, Runnable onEnd) {
    if (showing) return;
    showing = true;
    FrameLayout overlay = new FrameLayout(activity);
    overlay.setId(VIEW_ID);
    overlay.setClickable(true);
    overlay.setFocusable(true);
    overlay.setBackground(new ColorDrawable(Color.parseColor("#0B421A")));
    overlay.setLayoutParams(
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    ViewGroup root = activity.findViewById(android.R.id.content);
    if (root == null) {
      showing = false;
      return;
    }
    root.addView(overlay);
    final boolean[] bound = {false};
    Runnable bindWhenSized =
        () -> {
          if (bound[0]) return;
          if (overlay.getWidth() < 1 || overlay.getHeight() < 1) return;
          bound[0] = true;
          bindScene(activity, overlay, manifest, onEnd);
        };
    overlay.addOnLayoutChangeListener(
        (v, l, t, r, b, ol, ot, or, ob) -> bindWhenSized.run());
    overlay.post(bindWhenSized);
  }

  private static void bindScene(
      Activity activity, FrameLayout overlay, JSONObject manifest, Runnable onEnd) {
    try {
      JSONArray scenes = manifest.getJSONArray("scenes");
      if (scenes.length() < 1) {
        finish(overlay, onEnd);
        return;
      }
      JSONObject scene = scenes.getJSONObject(0);
      String bg = scene.getJSONObject("background").optString("color", "#0B421A");
      overlay.setBackground(new ColorDrawable(parseColor(bg)));
      JSONArray layers = scene.getJSONArray("layers");
      List<JSONObject> ordered = new ArrayList<>();
      for (int i = 0; i < layers.length(); i++) {
        JSONObject layer = layers.getJSONObject(i);
        if (!layer.optBoolean("visible", true)) continue;
        ordered.add(layer);
      }
      Collections.sort(ordered, Comparator.comparingInt(a -> a.optInt("zIndex", 0)));
      int width = overlay.getWidth();
      int height = overlay.getHeight();
      if (width < 1 || height < 1) {
        Log.w(TAG, "bind_skipped reason=zero_bounds");
        showing = false;
        ViewGroup parent = (ViewGroup) overlay.getParent();
        if (parent != null) parent.removeView(overlay);
        return;
      }
      for (JSONObject layer : ordered) {
        String mediaId = layer.getString("mediaId");
        File file = OpeningPackStore.mediaFile(activity, mediaId);
        Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath());
        if (bitmap == null) continue;
        JSONObject frame = layer.getJSONObject("frame");
        int x = Math.round((float) (frame.getDouble("x") * width));
        int y = Math.round((float) (frame.getDouble("y") * height));
        int w = Math.max(1, Math.round((float) (frame.getDouble("w") * width)));
        int h = Math.max(1, Math.round((float) (frame.getDouble("h") * height)));
        ImageView image = new ImageView(activity);
        image.setImageBitmap(bitmap);
        boolean cover = "cover".equals(layer.optString("fit"));
        image.setScaleType(cover ? ImageView.ScaleType.CENTER_CROP : ImageView.ScaleType.FIT_CENTER);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h);
        lp.leftMargin = x;
        lp.topMargin = y;
        lp.gravity = Gravity.TOP | Gravity.START;
        overlay.addView(image, lp);
      }
      long duration = manifest.optLong("sceneDurationMs", 2400);
      new Handler(Looper.getMainLooper()).postDelayed(() -> finish(overlay, onEnd), Math.max(400, duration));
    } catch (Exception e) {
      Log.w(TAG, "present_failed " + e.getMessage());
      finish(overlay, onEnd);
    }
  }

  private static void finish(FrameLayout overlay, Runnable onEnd) {
    ViewGroup parent = (ViewGroup) overlay.getParent();
    if (parent != null) parent.removeView(overlay);
    showing = false;
    if (onEnd != null) onEnd.run();
  }

  private static int parseColor(String raw) {
    try {
      return Color.parseColor(raw);
    } catch (Exception ignored) {
      return Color.parseColor("#0B421A");
    }
  }
}
