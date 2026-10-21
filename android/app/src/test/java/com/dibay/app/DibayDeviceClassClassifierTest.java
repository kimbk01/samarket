package com.dibay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class DibayDeviceClassClassifierTest {

  private static DibayDeviceClassClassifier.Result sw(int dp) {
    return DibayDeviceClassClassifier.classify(dp, "NORMAL");
  }

  @Test
  public void sw601PhoneUnder7InchStaysPhone() {
    DibayDeviceClassClassifier.Result r = DibayDeviceClassClassifier.applyPhysicalDiagonalGuard(sw(601), 6.7);
    assertEquals("PHONE_ANDROID", r.deviceClass);
    assertEquals("physicalDiagonal", r.source);
  }

  @Test
  public void realTabletStaysTablet() {
    assertEquals("TABLET_ANDROID", DibayDeviceClassClassifier.applyPhysicalDiagonalGuard(sw(601), 8.7).deviceClass);
    assertEquals("TABLET_ANDROID", DibayDeviceClassClassifier.applyPhysicalDiagonalGuard(sw(601), null).deviceClass);
  }

  @Test
  public void phoneVerdictUnchanged() {
    assertEquals("PHONE_ANDROID", DibayDeviceClassClassifier.applyPhysicalDiagonalGuard(sw(384), 6.7).deviceClass);
    assertEquals("smallestScreenWidthDp", DibayDeviceClassClassifier.applyPhysicalDiagonalGuard(sw(384), 6.7).source);
  }

  @Test
  public void diagonalFromPanel() {
    // SM-M156S 1080x2340 @ ~385dpi ≈ 6.7"
    assertEquals(6.7, DibayDeviceClassClassifier.diagonalInches(1080, 2340, 385f, 385f), 0.05);
    assertNull(DibayDeviceClassClassifier.diagonalInches(1080, 2340, 0f, 0f));
    assertNull(DibayDeviceClassClassifier.diagonalInches(0, 2340, 385f, 385f));
  }
}
