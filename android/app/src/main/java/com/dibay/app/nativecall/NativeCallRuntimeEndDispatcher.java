package com.dibay.app.nativecall;

import android.content.Context;
import com.dibay.app.nativevideo.NativeVideoCallLog;
import com.dibay.app.nativevideo.NativeVideoCallOwner;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import com.dibay.app.nativevoice.NativeVoiceCallLog;
import com.dibay.app.nativevoice.NativeVoiceCallOwner;
import com.dibay.app.nativevoice.NativeVoiceCallRuntime;

/** O4 thin router: terminal events are delivered to the owning Native Runtime. */
public final class NativeCallRuntimeEndDispatcher {
  private NativeCallRuntimeEndDispatcher() {}

  public static boolean dispatch(Context context, String callId, String terminalKind, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return false;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    String kind = terminalKind != null && !terminalKind.trim().isEmpty() ? terminalKind.trim() : "ended";
    String src = source != null && !source.trim().isEmpty() ? source.trim() : "unknown";

    if (NativeVoiceCallOwner.isNativeOwned(sid) || NativeVoiceCallRuntime.getSession(sid) != null) {
      NativeVoiceCallLog.info("native_end_dispatch", sid, "kind=" + kind + " source=" + src + " runtime=voice");
      NativeVoiceCallRuntime.onRemoteTerminal(app, sid, kind, src);
      return true;
    }

    if (NativeVideoCallOwner.isNativeOwned(sid) || NativeVideoCallRuntime.getSession(sid) != null) {
      NativeVideoCallLog.info("native_end_dispatch", sid, "kind=" + kind + " source=" + src + " runtime=video");
      NativeVideoCallRuntime.onRemoteTerminal(app, sid, kind, src);
      return true;
    }

    return false;
  }
}
