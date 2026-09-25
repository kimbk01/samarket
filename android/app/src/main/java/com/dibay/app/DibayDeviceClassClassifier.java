package com.dibay.app;

import android.content.res.Configuration;
import com.getcapacitor.JSObject;

/**
 * FD1 DeviceClass authority — Android native SSOT.
 * Threshold and verdict are unchanged. Plugin and app-orientation both consume this.
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
      return result;
    }
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
