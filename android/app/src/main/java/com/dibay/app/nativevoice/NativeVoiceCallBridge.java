package com.dibay.app.nativevoice;

import android.content.Context;

/** Post-connected Web sync only. Never used to establish the call. */
public final class NativeVoiceCallBridge {
  private NativeVoiceCallBridge() {}

  public static void syncConnected(Context context, String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    // Phase 4 will inject a Web event when the app is already alive. Native call does not wait for it.
    NativeVoiceCallLog.info("web_sync_connected", callId.trim(), "mode=deferred");
  }
}
