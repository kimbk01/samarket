package com.dibay.app.nativevoice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class NativeVoiceCallUpgradeBroadcastTest {
  @Test
  public void inviteChannelName_matchesWebSsotLowercase() {
    assertEquals(
        "cm-call-invite:9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
        NativeVoiceCallUpgradeRealtimeClient.inviteChannelName(
            "9259AB7D-AE5F-4D4A-819A-8D5BD568ECF8"));
  }

  @Test
  public void realtimeTopic_prefixesRealtimeNamespace() {
    assertEquals(
        "realtime:cm-call-invite:abc",
        NativeVoiceCallUpgradeRealtimeClient.realtimeTopic("cm-call-invite:abc"));
  }

  @Test
  public void broadcastCodec_roundTrip_requestPayload() throws Exception {
    JSONObject payload = new JSONObject();
    payload.put("sessionId", "sess-1");
    payload.put("fromUserId", "user-a");
    byte[] encoded =
        NativeVoiceCallUpgradeRealtimeClient.encodeBroadcastPush(
            "1",
            "2",
            "realtime:cm-call-invite:peer",
            NativeVoiceCallUpgradeRealtimeClient.CM_VIDEO_UPGRADE_REQUEST,
            payload);
    NativeVoiceCallUpgradeRealtimeClient.DecodedBroadcast decoded =
        NativeVoiceCallUpgradeRealtimeClient.decodeBroadcastPush(encoded);
    assertNotNull(decoded);
    assertEquals(NativeVoiceCallUpgradeRealtimeClient.CM_VIDEO_UPGRADE_REQUEST, decoded.userEvent);
    assertEquals("sess-1", decoded.payload.optString("sessionId"));
    assertEquals("user-a", decoded.payload.optString("fromUserId"));
  }

  @Test
  public void broadcastCodec_roundTrip_responsePayload() throws Exception {
    JSONObject payload = new JSONObject();
    payload.put("sessionId", "sess-2");
    payload.put("fromUserId", "user-b");
    payload.put("accepted", true);
    byte[] encoded =
        NativeVoiceCallUpgradeRealtimeClient.encodeBroadcastReceive(
            "realtime:cm-call-invite:self",
            NativeVoiceCallUpgradeRealtimeClient.CM_VIDEO_UPGRADE_RESPONSE,
            payload);
    NativeVoiceCallUpgradeRealtimeClient.DecodedBroadcast decoded =
        NativeVoiceCallUpgradeRealtimeClient.decodeBroadcast(encoded);
    assertNotNull(decoded);
    assertEquals(NativeVoiceCallUpgradeRealtimeClient.CM_VIDEO_UPGRADE_RESPONSE, decoded.userEvent);
    assertTrue(decoded.payload.optBoolean("accepted"));
  }

  @Test
  public void credentialCache_validWithinSkewWindow() {
    NativeVoiceCallUpgradeBroadcast.clearCredentialCacheForTests();
    NativeVoiceCallApi.RealtimeCredentials credentials =
        new NativeVoiceCallApi.RealtimeCredentials("token-value", "2099-01-01T00:00:00.000Z");
    NativeVoiceCallUpgradeBroadcast.RealtimeCredentialCache cache =
        NativeVoiceCallUpgradeBroadcast.RealtimeCredentialCache.from(credentials);
    assertTrue(cache.isValid());
    assertFalse(cache.accessToken.isEmpty());
  }
}
