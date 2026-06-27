package com.dibay.app.nativevideo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Native Video caller join entry — no WebView call establishment. */
public final class NativeVideoCallOutgoingEntry extends BroadcastReceiver {
  public static final String ACTION_START_CALLER_JOIN = "com.dibay.app.nativevideo.START_CALLER_JOIN";
  public static final String EXTRA_ROOM_ID = "roomId";
  public static final String EXTRA_PEER_USER_ID = "peerUserId";
  public static final String EXTRA_PEER_NAME = "peerName";
  public static final String EXTRA_MEDIA_TYPE = "mediaType";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null) return;
    if (!ACTION_START_CALLER_JOIN.equals(intent.getAction())) return;
    NativeVideoCallLog.info("caller_broadcast_received", "unknown");
    String callId = intent.getStringExtra(NativeVideoCallActivity.EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) return;
    NativeVideoCallRuntime.handleOutgoing(
        context.getApplicationContext(),
        callId.trim(),
        intent.getStringExtra(EXTRA_ROOM_ID),
        intent.getStringExtra(EXTRA_PEER_USER_ID),
        intent.getStringExtra(EXTRA_PEER_NAME),
        intent.getStringExtra(EXTRA_MEDIA_TYPE));
  }
}
