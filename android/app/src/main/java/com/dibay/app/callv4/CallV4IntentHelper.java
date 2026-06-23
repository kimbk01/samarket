package com.dibay.app.callv4;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import com.dibay.app.DibayServerOrigin;
import com.dibay.app.IncomingCallActivity;

public final class CallV4IntentHelper {
  public static final String EXTRA_CALL_ID = "callId";
  public static final String EXTRA_SOURCE = "source";

  private CallV4IntentHelper() {}

  /**
   * FGS / notification accept — {@link IncomingCallActivity} ACTION_ACCEPT so
   * {@link com.dibay.app.IncomingCallActionCoordinator} runs before CallScreenActivity.
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

  public static Intent buildCallScreenActivityIntent(Context context, String callId, String source) {
    Context app = context.getApplicationContext();
    Intent intent = new Intent(app, CallScreenActivity.class);
    intent.putExtra(EXTRA_CALL_ID, callId != null ? callId.trim() : "");
    intent.putExtra(EXTRA_SOURCE, source != null ? source : "native_accept");
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return intent;
  }

  public static String buildCallScreenUrl(Context context, String callId, String source) {
    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.trim().isEmpty()) {
      origin = "https://samarket.vercel.app";
    }
    String sid = callId != null ? callId.trim() : "";
    String src = source != null ? source.trim() : "native_accept";
    return origin
        + "/community-messenger/calls-v4/"
        + Uri.encode(sid)
        + "?source="
        + Uri.encode(src);
  }
}
