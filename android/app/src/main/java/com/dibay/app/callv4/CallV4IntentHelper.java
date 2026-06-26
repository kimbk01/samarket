package com.dibay.app.callv4;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import com.dibay.app.IncomingCallActivity;
import com.dibay.app.MainActivity;

/** V4 Telegram Lane intents — MainActivity single WebView SSOT only. */
public final class CallV4IntentHelper {
  public static final String EXTRA_CALL_ID = "callId";
  public static final String EXTRA_SOURCE = "source";
  public static final String EXTRA_V4_LOCK_BACKGROUND_HYDRATION = "v4LockBackgroundHydration";

  private CallV4IntentHelper() {}

  /**
   * FGS / notification accept — {@link IncomingCallActivity} ACTION_ACCEPT so
   * {@link com.dibay.app.IncomingCallActionCoordinator} runs before MainActivity route.
   */
  public static Intent buildCoordinatorAcceptIntent(Context context, String callId) {
    Context app = context.getApplicationContext();
    String sid = callId != null ? callId.trim() : "";
    Intent intent = new Intent(app, IncomingCallActivity.class);
    intent.setAction(IncomingCallActivity.ACTION_ACCEPT);
    intent.putExtra(IncomingCallActivity.EXTRA_CALL_ID, sid);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return intent;
  }

  /** Lock/sleep incoming accept — Web hydrates in background; do not dismiss keyguard. */
  public static boolean isLockNativeAcceptSource(String source) {
    return source != null && "native_lock_accept".equals(source.trim());
  }

  /** V4 accept — bring MainActivity to front with calls-v4 accept deep link. */
  public static Intent buildMainActivityV4AcceptIntent(Context context, String callId, String source) {
    String sid = callId != null ? callId.trim() : "";
    String src = source != null && !source.trim().isEmpty() ? source.trim() : "native_accept";
    Intent launch = new Intent(context, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    launch.setData(
        Uri.parse(
            "dibay://call-v4/"
                + Uri.encode(sid)
                + "?action=accept&source="
                + Uri.encode(src)));
    launch.putExtra(EXTRA_V4_LOCK_BACKGROUND_HYDRATION, CallV4IntentHelper.isLockNativeAcceptSource(src));
    launch.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_SINGLE_TOP
            | Intent.FLAG_ACTIVITY_NO_ANIMATION);
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] main_activity_v4_accept_intent_built callId=" + sid);
    return launch;
  }

  public static String buildV4AcceptAppPath(String callId, String source) {
    String sid = callId != null ? callId.trim() : "";
    String src = source != null && !source.trim().isEmpty() ? source.trim() : "native_accept";
    return "/community-messenger/calls-v4/"
        + Uri.encode(sid)
        + "?action=accept&source="
        + Uri.encode(src);
  }
}
