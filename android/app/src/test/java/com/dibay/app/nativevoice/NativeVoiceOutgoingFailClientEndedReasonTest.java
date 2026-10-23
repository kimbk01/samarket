package com.dibay.app.nativevoice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import android.app.Application;

/** E-C2-B Phase A — TRUSTED map only; Agora unmapped. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativeVoiceOutgoingFailClientEndedReasonTest {

  @Test
  public void tokenFetchFailed_mapsToFailedSignaling() {
    assertEquals(
        "failed_signaling",
        NativeVoiceOutgoingFailClientEndedReason.mapIfTrusted("token_fetch_failed status=401"));
    assertEquals(
        "failed_signaling",
        NativeVoiceOutgoingFailClientEndedReason.mapIfTrusted("TOKEN_FETCH_FAILED"));
  }

  @Test
  public void agoraAndUnknown_doNotInventFailedToken() {
    assertNull(NativeVoiceOutgoingFailClientEndedReason.mapIfTrusted("agora error=101"));
    assertNull(NativeVoiceOutgoingFailClientEndedReason.mapIfTrusted("join_return=-17"));
    assertNull(NativeVoiceOutgoingFailClientEndedReason.mapIfTrusted("native_engine_busy"));
    assertNull(NativeVoiceOutgoingFailClientEndedReason.mapIfTrusted("unsupported_media_type"));
    assertNull(NativeVoiceOutgoingFailClientEndedReason.mapIfTrusted(null));
    assertNull(NativeVoiceOutgoingFailClientEndedReason.mapIfTrusted(""));
  }
}
