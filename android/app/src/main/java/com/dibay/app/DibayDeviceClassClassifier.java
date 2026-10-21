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
 * sw >= 600dp → tablet, except a physical screen diagonal under 7" stays phone
 * (Samsung "screen zoom" smaller can report sw601 on a 6.7" phone — Owner E1, 2026-10-21).
 */
public final class DibayDeviceClassClassifier {
  public static final int TABLET_SMALLEST_WIDTH_DP = 600;
  public static final double PHONE_MAX_PHYSICAL_DIAGONAL_INCHES = 7.0;

  private DibayDeviceClassClassifier() {}

  public static final class Result {
    public final String deviceClass;
    public final String source;
    public final String reason;
    public final Integer smallestScreenWidthDp;
    public final String screenLayoutSize;
    public final boolean conflict;
    public Double physicalDiagonalInches;

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
      if (physicalDiagonalInches != null) {
        result.put("physicalDiagonalInches", Math.round(physicalDiagonalInches * 10.0) / 10.0);
      }
      return result;
    }
  }

  /** Current configuration + physical screen size of the device behind {@code context}. */
  public static Result classify(Context context) {
    Resources resources = context != null ? context.getResources() : null;
    return classifyWithPhysicalDiagonal(resources != null ? resources.getConfiguration() : null, physicalDiagonalInches(context));
  }

  public static Result classifyWithPhysicalDiagonal(Configuration config, Double physicalDiagonalInches) {
    Result base = classify(config);
    Result guarded = applyPhysicalDiagonalGuard(base, physicalDiagonalInches);
    guarded.physicalDiagonalInches = physicalDiagonalInches;
    return guarded;
  }

  /** sw-based TABLET on a screen physically smaller than 7" → PHONE. */
  static Result applyPhysicalDiagonalGuard(Result base, Double physicalDiagonalInches) {
    if (
      base == null ||
      physicalDiagonalInches == null ||
      !"TABLET_ANDROID".equals(base.deviceClass) ||
      !"smallestScreenWidthDp".equals(base.source) ||
      physicalDiagonalInches >= PHONE_MAX_PHYSICAL_DIAGONAL_INCHES
    ) {
      return base;
    }
    return new Result(
      "PHONE_ANDROID",
      "physicalDiagonal",
      "physical_diagonal_below_7in",
      base.smallestScreenWidthDp,
      base.screenLayoutSize,
      base.conflict
    );
  }

  /** Physical diagonal of the full display (not the window). null when the panel dpi is unusable. */
  static Double physicalDiagonalInches(Context context) {
    if (context == null) return null;
    try {
      DisplayMetrics dm = context.getResources().getDisplayMetrics();
      WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
      if (dm == null || wm == null) return null;
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
      return diagonalInches(widthPx, heightPx, dm.xdpi, dm.ydpi);
    } catch (RuntimeException ignored) {
      return null;
    }
  }

  static Double diagonalInches(int widthPx, int heightPx, float xdpi, float ydpi) {
    if (widthPx <= 0 || heightPx <= 0) return null;
    double dpi = (xdpi + ydpi) / 2.0;
    if (!(dpi >= 72.0 && dpi <= 1000.0)) return null;
    return Math.sqrt((double) widthPx * widthPx + (double) heightPx * heightPx) / dpi;
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
