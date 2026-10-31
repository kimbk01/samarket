package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.call.CallForegroundService;
import com.dibay.app.nativecall.NativeCallRuntimeEndDispatcher;

/**
 * Single entry for remote/local call terminal — cancel, reject, missed, ended.
 * Runs regardless of app foreground state.
 */
public final class IncomingCallTerminalHandler {
  private static final String TAG = "DIBAY_CALL";

  private IncomingCallTerminalHandler() {}

  public static void handle(Context context, String callId, String terminalKind, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    String kind = terminalKind != null ? terminalKind.trim().toLowerCase() : "cancelled";
    String consumedReason = mapConsumedReason(kind);

    Log.i(TAG, "[DIBAY_CALL] terminal_received callId=" + sid + " kind=" + kind + " source=" + source);
    if (isAnsweredElsewhereForLocallyAcceptedCall(sid, kind)) {
      // A10: push ack·상태 조회가 「active」(→ answered_elsewhere)를 돌려줘도, 이 기기가 이미 수락한 통화면
      // 서버 active 는 이 기기의 수락이다. 정리·웹 terminal 전달·consumed 덮어쓰기를 하지 않는다.
      // 다른 기기가 먼저 받은 경우는 이 기기의 accept PATCH 응답(answered_elsewhere)으로 수렴한다.
      Log.i(TAG, "[DIBAY_CALL] terminal_ignored_local_accept callId=" + sid + " kind=" + kind + " source=" + source);
      return;
    }
    NativeCallRuntimeEndDispatcher.dispatch(app, sid, kind, "terminal_handler:" + source);

    IncomingCallSessionCleanup.purgeCallPresentation(app, sid, consumedReason);
    DibayCallConsumedStore.mark(app, sid, consumedReason);
    Log.i(TAG, "[DIBAY_CALL] terminal_tombstone_mark callId=" + sid + " reason=" + consumedReason);

    IncomingCallActionCoordinator.complete(sid, kind);

    MainActivity.clearPersistedPendingPushRoute(app);
    MainActivity.clearPersistedCallPendingRoute(app);
    DibayCallPushLog.info("pending_route_discarded_terminal", sid, "kind=" + kind);
    MainActivity.clearNativeCalleeAcceptPending(app);

    ForegroundIncomingCallRegistry.clear(sid);

    String webStatus = mapWebTerminalStatus(kind);
    if ("cancelled".equals(kind) || "canceled".equals(kind)) {
      Log.i(TAG, "[DIBAY_CALL] call_canceled_native_handled callId=" + sid + " source=" + source);
    }
    MainActivity.deliverCallTerminalEvent(app, sid, webStatus);

    Log.i(TAG, "[DIBAY_CALL] terminal_handler_done callId=" + sid + " kind=" + kind);
  }

  static boolean isAnsweredElsewhereForLocallyAcceptedCall(String callId, String kind) {
    if (!"call_answered_elsewhere".equals(kind) && !"answered_elsewhere".equals(kind)) return false;
    com.dibay.app.nativevoice.NativeVoiceCallRuntime.Session voice =
        com.dibay.app.nativevoice.NativeVoiceCallRuntime.getSession(callId);
    if (voice != null
        && (voice.state == com.dibay.app.nativevoice.NativeVoiceCallRuntime.State.ACCEPTING
            || voice.state == com.dibay.app.nativevoice.NativeVoiceCallRuntime.State.CONNECTING
            || voice.state == com.dibay.app.nativevoice.NativeVoiceCallRuntime.State.CONNECTED)) {
      return true;
    }
    com.dibay.app.nativevideo.NativeVideoCallRuntime.Session video =
        com.dibay.app.nativevideo.NativeVideoCallRuntime.getSession(callId);
    return video != null
        && (video.state == com.dibay.app.nativevideo.NativeVideoCallRuntime.State.ACCEPTING
            || video.state == com.dibay.app.nativevideo.NativeVideoCallRuntime.State.CONNECTING
            || video.state == com.dibay.app.nativevideo.NativeVideoCallRuntime.State.CONNECTED);
  }

  public static boolean isTerminalPushType(String type) {
    if (type == null) return false;
    switch (type.trim().toLowerCase()) {
      case "call_canceled":
      case "call_cancelled":
      case "call_ended":
      case "call_rejected":
      case "call_answered_elsewhere":
      case "call_missed":
      case "missed_call":
        return true;
      default:
        return false;
    }
  }

  public static String normalizeTerminalKind(String type) {
    if (type == null) return "cancelled";
    switch (type.trim().toLowerCase()) {
      case "call_canceled":
      case "call_cancelled":
        return "cancelled";
      case "call_rejected":
        return "rejected";
      case "call_answered_elsewhere":
        return "answered_elsewhere";
      case "call_missed":
      case "missed_call":
        return "missed";
      case "call_ended":
        return "ended";
      default:
        return "cancelled";
    }
  }

  /** Dismiss lock-screen and in-app foreground incoming UI for callId. */
  public static void finishIncomingUiOnly(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    IncomingCallSessionCleanup.purgeCallPresentation(context, callId.trim(), "finish_ui_only");
  }

  static void broadcastFinishIncomingActivity(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Intent intent = new Intent(IncomingCallActivity.ACTION_TERMINAL);
    intent.setPackage(context.getPackageName());
    intent.putExtra(IncomingCallActivity.EXTRA_CALL_ID, callId.trim());
    context.sendBroadcast(intent);
  }

  private static String mapConsumedReason(String kind) {
    switch (kind) {
      case "rejected":
        return "declined";
      case "missed":
        return "missed";
      case "ended":
        return "ended";
      case "answered_elsewhere":
        return "answered_elsewhere";
      case "cancelled":
      case "canceled":
      default:
        return "cancelled";
    }
  }

  private static String mapWebTerminalStatus(String kind) {
    switch (kind) {
      case "rejected":
        return "rejected";
      case "missed":
        return "missed";
      case "ended":
        return "ended";
      case "answered_elsewhere":
        return "answered_elsewhere";
      default:
        return "cancelled";
    }
  }
}
