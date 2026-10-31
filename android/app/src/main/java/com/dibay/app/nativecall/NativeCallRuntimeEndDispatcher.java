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

  /**
   * 웹 endCall (A9): 서버 상태에서 온 사유만 상대 종료로 받고, 그 외(failed·정리·감시 타이머 등)는
   * 살아 있는 통화를 끝내지 않는다. 판단은 각 Runtime 의 종료 판단 함수가 한다.
   *
   * @return true 면 Native Runtime 이 이 통화를 소유한다(판단 결과와 무관).
   */
  public static boolean dispatchWebEndRequest(
      Context context, String callId, String reason, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return false;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    String r = reason != null && !reason.trim().isEmpty() ? reason.trim() : "client_end";
    String src = source != null && !source.trim().isEmpty() ? source.trim() : "unknown";

    if (NativeVoiceCallOwner.isNativeOwned(sid) || NativeVoiceCallRuntime.getSession(sid) != null) {
      NativeVoiceCallLog.info("native_web_end_request", sid, "reason=" + r + " source=" + src + " runtime=voice");
      NativeVoiceCallRuntime.onWebEndRequest(app, sid, r, src);
      return true;
    }

    if (NativeVideoCallOwner.isNativeOwned(sid) || NativeVideoCallRuntime.getSession(sid) != null) {
      NativeVideoCallLog.info("native_web_end_request", sid, "reason=" + r + " source=" + src + " runtime=video");
      NativeVideoCallRuntime.onWebEndRequest(app, sid, r, src);
      return true;
    }

    return false;
  }
}
