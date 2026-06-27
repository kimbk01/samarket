package com.dibay.app.nativevideo;

import android.content.Context;
import com.dibay.app.call.NativeCallServicePlugin;

/** Post-connected Web sync only. Never used to establish the call. */
public final class NativeVideoCallBridge {
  private NativeVideoCallBridge() {}

  public static void syncConnected(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(sid);
    if (session == null || session.state != NativeVideoCallRuntime.State.CONNECTED) return;
    String direction = session.initiator ? "outgoing" : "incoming";
    NativeVideoCallLog.info("native_connected_emit", sid, "runtime=native_video direction=" + direction);
    NativeCallServicePlugin.publishNativeConnected(
        sid,
        session.roomId,
        "video",
        direction,
        session.callerId,
        session.callerName,
        "native_video",
        "NativeVideoCallService");
  }
}
