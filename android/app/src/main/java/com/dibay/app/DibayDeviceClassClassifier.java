package com.dibay.app;

import android.content.Context;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Rect;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import com.getcapacitor.JSObject;

/**
 * FD1 DeviceClass authority — Android native SSOT.
 * Plugin and app-orientation both consume this.
 * sw >= 600dp → tablet, measured at the device's factory (stable) density — a user "screen zoom" /
 * display-size change can make a phone report sw601 (SM-M156S, Owner E1 2026-10-21).
 */
public final class DibayDeviceClassClassifier {
  public static final int TABLET_SMALLEST_WIDTH_DP = 600;

  private DibayDeviceClassClassifier() {}

  public static final class Result {
    public final String deviceClass;
    public final String source;
    public final String reason;
    public final Integer smallestScreenWidthDp;
    public final String screenLayoutSize;
    public final boolean conflict;
    public Integer stableSmallestScreenWidthDp;

    Result(
      String deviceClass,
      String source,
      String reason,
      Integer smallestScreenWidthDp,
      String screenLayoutSize,
      boolean conflict
    ) {
      this.deviceClass = deviceClass;
      this.source = source;
      this.reason = reason;
      this.smallestScreenWidthDp = smallestScreenWidthDp;
      this.screenLayoutSize = screenLayoutSize;
      this.conflict = conflict;
    }

    JSObject toJsObject() {
      JSObject result = new JSObject();
      result.put("deviceClass", deviceClass);
      result.put("source", source);
      if (reason != null) {
        result.put("reason", reason);
      }
      if (smallestScreenWidthDp != null) {
        result.put("smallestScreenWidthDp", smallestScreenWidthDp.intValue());
      }
      if (screenLayoutSize != null) {
        result.put("screenLayoutSize", screenLayoutSize);
        result.put("fallbackScreenLayout", screenLayoutSize);
      }
      result.put("conflict", conflict);
      if (stableSmallestScreenWidthDp != null) {
        result.put("stableSmallestScreenWidthDp", stableSmallestScreenWidthDp.intValue());
      }
      return result;
    }
  }

  /** Current configuration + factory-density smallest width of the device behind {@code context}. */
  public static Result classify(Context context) {
    Resources resources = context != null ? context.getResources() : null;
    return classifyWithStableDensity(
      resources != null ? resources.getConfiguration() : null,
      stableSmallestScreenWidthDp(context)
    );
  }

  public static Result classifyWithStableDensity(Configuration config, Integer stableSmallestScreenWidthDp) {
    Result guarded = applyStableDensityGuard(classify(config), stableSmallestScreenWidthDp);
    guarded.stableSmallestScreenWidthDp = stableSmallestScreenWidthDp;
    return guarded;
  }

  /** sw-based TABLET whose smallest width at factory density is < 600dp → PHONE (display zoom only). */
  static Result applyStableDensityGuard(Result base, Integer stableSmallestScreenWidthDp) {
    if (
      base == null ||
      stableSmallestScreenWidthDp == null ||
      !"TABLET_ANDROID".equals(base.deviceClass) ||
      !"smallestScreenWidthDp".equals(base.source) ||
      stableSmallestScreenWidthDp >= TABLET_SMALLEST_WIDTH_DP
    ) {
      return base;
    }
    return new Result(
      "PHONE_ANDROID",
      "stableDensity",
      "display_zoom_phone",
      base.smallestScreenWidthDp,
      base.screenLayoutSize,
      base.conflict
    );
  }

  /** Full-display short side in dp at {@link DisplayMetrics#DENSITY_DEVICE_STABLE}. null when unknown. */
  static Integer stableSmallestScreenWidthDp(Context context) {
    if (context == null) return null;
    try {
      WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
      if (wm == null) return null;
      int widthPx;
      int heightPx;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Rect bounds = wm.getMaximumWindowMetrics().getBounds();
        widthPx = bounds.width();
        heightPx = bounds.height();
      } else {
        DisplayMetrics real = new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(real);
        widthPx = real.widthPixels;
        heightPx = real.heightPixels;
      }
      return smallestWidthDpAtDensity(widthPx, heightPx, DisplayMetrics.DENSITY_DEVICE_STABLE);
    } catch (RuntimeException ignored) {
      return null;
    }
  }

  static Integer smallestWidthDpAtDensity(int widthPx, int heightPx, int densityDpi) {
    if (widthPx <= 0 || heightPx <= 0 || densityDpi <= 0) return null;
    return (int) Math.floor(Math.min(widthPx, heightPx) * 160.0 / densityDpi);
  }

  public static Result classify(Configuration config) {
    Integer smallestScreenWidthDp = null;
    String screenLayoutSize = null;
    if (config != null) {
      if (config.smallestScreenWidthDp > 0) {
        smallestScreenWidthDp = config.smallestScreenWidthDp;
      }
      screenLayoutSize = screenLayoutSizeName(config.screenLayout & Configuration.SCREENLAYOUT_SIZE_MASK);
    }
    return classify(smallestScreenWidthDp, screenLayoutSize);
  }

  public static Result classify(Integer smallestScreenWidthDp, String screenLayoutSize) {
    boolean swUsable = smallestScreenWidthDp != null && smallestScreenWidthDp > 0;
    String layoutVerdict = layoutTabletVerdict(screenLayoutSize);

    if (swUsable) {
      boolean tablet = smallestScreenWidthDp >= TABLET_SMALLEST_WIDTH_DP;
      boolean conflict = layoutVerdict != null && tablet != "tablet".equals(layoutVerdict);
      return new Result(
        tablet ? "TABLET_ANDROID" : "PHONE_ANDROID",
        "smallestScreenWidthDp",
        null,
        smallestScreenWidthDp,
        screenLayoutSize,
        conflict
      );
    }

    if ("tablet".equals(layoutVerdict)) {
      return new Result("TABLET_ANDROID", "screenLayout", null, smallestScreenWidthDp, screenLayoutSize, false);
    }
    if ("phone".equals(layoutVerdict)) {
      return new Result("PHONE_ANDROID", "screenLayout", null, smallestScreenWidthDp, screenLayoutSize, false);
    }

    return new Result(
      "UNKNOWN",
      "android_configuration_unavailable",
      "android_configuration_unavailable",
      smallestScreenWidthDp,
      screenLayoutSize,
      false
    );
  }

  static String screenLayoutSizeName(int size) {
    switch (size) {
      case Configuration.SCREENLAYOUT_SIZE_SMALL:
        return "SMALL";
      case Configuration.SCREENLAYOUT_SIZE_NORMAL:
        return "NORMAL";
      case Configuration.SCREENLAYOUT_SIZE_LARGE:
        return "LARGE";
      case Configuration.SCREENLAYOUT_SIZE_XLARGE:
        return "XLARGE";
      case Configuration.SCREENLAYOUT_SIZE_UNDEFINED:
        return "UNDEFINED";
      default:
        return "UNKNOWN";
    }
  }

  static String layoutTabletVerdict(String size) {
    if ("LARGE".equals(size) || "XLARGE".equals(size)) return "tablet";
    if ("NORMAL".equals(size) || "SMALL".equals(size)) return "phone";
    return null;
  }
}
