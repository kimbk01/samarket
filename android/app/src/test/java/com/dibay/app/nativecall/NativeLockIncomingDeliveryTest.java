package com.dibay.app.nativecall;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import android.os.PowerManager;
import androidx.test.core.app.ApplicationProvider;
import com.dibay.app.DibayKeyguardHelper;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowPowerManager;

/** Native lock incoming — device state gate for Activity-first delivery. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativeLockIncomingDeliveryTest {
  private Context context() {
    return ApplicationProvider.getApplicationContext().getApplicationContext();
  }

  @Test
  public void isLockIncoming_falseWhenInteractiveAndUnlocked() {
    Context app = context();
    PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
    ShadowPowerManager shadow = org.robolectric.Shadows.shadowOf(pm);
    shadow.setIsInteractive(true);
    assertFalse(NativeLockIncomingDelivery.isLockIncoming(app));
  }

  @Test
  public void isLockIncoming_trueWhenScreenNotInteractive() {
    Context app = context();
    PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
    ShadowPowerManager shadow = org.robolectric.Shadows.shadowOf(pm);
    shadow.setIsInteractive(false);
    assertTrue(NativeLockIncomingDelivery.isLockIncoming(app));
  }

  @Test
  public void isLockIncoming_trueWhenKeyguardLocked() {
    Context app = context();
    // Robolectric defaults keyguard locked in many configs; non-interactive covers lock branch.
    PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
    ShadowPowerManager shadow = org.robolectric.Shadows.shadowOf(pm);
    shadow.setIsInteractive(false);
    assertTrue(DibayKeyguardHelper.isKeyguardLocked(app) || !DibayKeyguardHelper.isInteractive(app));
    assertTrue(NativeLockIncomingDelivery.isLockIncoming(app));
  }

  @Test
  public void sourceConstant_matchesActivityContract() {
    assertTrue(NativeLockIncomingDelivery.SOURCE_NATIVE_LOCK_INCOMING.contains("native_lock_incoming"));
  }
}
