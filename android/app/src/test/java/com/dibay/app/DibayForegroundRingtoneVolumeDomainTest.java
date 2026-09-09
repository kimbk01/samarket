package com.dibay.app;

import static org.junit.Assert.assertEquals;

import android.media.AudioAttributes;
import android.media.AudioManager;
import java.lang.reflect.Method;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Incoming ringtone HW volume must bind to STREAM_RING (ringer), not MUSIC.
 * Device proof (API 36): prior signalling usage + MediaPlayer → Volume keys moved STREAM_MUSIC.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class DibayForegroundRingtoneVolumeDomainTest {
  @Test
  public void buildRingAudioAttributes_usesNotificationRingtoneAndStreamRing() throws Exception {
    Method m = DibayForegroundRingtone.class.getDeclaredMethod("buildRingAudioAttributes");
    m.setAccessible(true);
    AudioAttributes attrs = (AudioAttributes) m.invoke(null);
    assertEquals(AudioAttributes.USAGE_NOTIFICATION_RINGTONE, attrs.getUsage());
    assertEquals(AudioAttributes.CONTENT_TYPE_SONIFICATION, attrs.getContentType());
    assertEquals(AudioManager.STREAM_RING, attrs.getVolumeControlStream());
  }
}
