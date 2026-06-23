package com.dibay.app.callv4;

import android.content.Context;
import android.util.Log;

/** In-memory V4 call session — payload for MainActivity WebView route. */
public final class CallRuntimeV4 {
  public static final class Session {
    public final String callId;
    public final String roomId;
    public final String callerId;
    public final String callerName;
    public final String mediaType;
    public final String source;

    Session(
        String callId,
        String roomId,
        String callerId,
        String callerName,
        String mediaType,
        String source) {
      this.callId = callId;
      this.roomId = roomId;
      this.callerId = callerId;
      this.callerName = callerName;
      this.mediaType = mediaType;
      this.source = source;
    }
  }

  private static volatile Session activeSession;

  private CallRuntimeV4() {}

  public static Session openFromNativeStore(Context context, String callId, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return null;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    android.content.SharedPreferences prefs =
        app.getSharedPreferences("dibay_incoming_call_native_store", Context.MODE_PRIVATE);
    Session session =
        new Session(
            sid,
            safe(prefs.getString("room_id", "")),
            safe(prefs.getString("caller_id", "")),
            safe(prefs.getString("caller_name", "")),
            safe(prefs.getString("media_type", "voice")),
            source != null ? source : "native_accept");
    activeSession = session;
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] runtime_open callId="
            + sid
            + " roomId="
            + session.roomId
            + " source="
            + session.source);
    return session;
  }

  public static Session getActiveSession() {
    return activeSession;
  }

  private static String safe(String value) {
    return value != null ? value.trim() : "";
  }
}
