package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class DibayDeviceClassClassifierTest {

  private static DibayDeviceClassClassifier.Result sw(int dp) {
    return DibayDeviceClassClassifier.classify(dp, "NORMAL");
  }

  @Test
  public void zoomedPhoneReportingSw601StaysPhone() {
    DibayDeviceClassClassifier.Result r = DibayDeviceClassClassifier.applyStableDensityGuard(sw(601), 384);
    assertEquals("PHONE_ANDROID", r.deviceClass);
    assertEquals("stableDensity", r.source);
  }

  @Test
  public void realTabletStaysTablet() {
    assertEquals("TABLET_ANDROID", DibayDeviceClassClassifier.applyStableDensityGuard(sw(601), 601).deviceClass);
    assertEquals("TABLET_ANDROID", DibayDeviceClassClassifier.applyStableDensityGuard(sw(601), null).deviceClass);
  }

  @Test
  public void phoneVerdictUnchanged() {
    assertEquals("PHONE_ANDROID", DibayDeviceClassClassifier.applyStableDensityGuard(sw(384), 384).deviceClass);
    assertEquals("smallestScreenWidthDp", DibayDeviceClassClassifier.applyStableDensityGuard(sw(384), 384).source);
  }

  @Test
  public void smallestWidthAtFactoryDensity() {
    // SM-M156S 1080x2340 @ 450dpi → 384dp
    assertEquals(Integer.valueOf(384), DibayDeviceClassClassifier.smallestWidthDpAtDensity(1080, 2340, 450));
    assertNull(DibayDeviceClassClassifier.smallestWidthDpAtDensity(1080, 2340, 0));
    assertNull(DibayDeviceClassClassifier.smallestWidthDpAtDensity(0, 2340, 450));
  }
}
