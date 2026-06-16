package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

/** Shared intents for incoming call accept → web call route. */
public final class IncomingCallIntentHelper {
  private IncomingCallIntentHelper() {}

  public static Intent buildForegroundIncomingCallActivityIntent(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) {
      return null;
    }
    Intent intent = new Intent(context, ForegroundIncomingCallActivity.class);
    intent.putExtra(IncomingCallActivity.EXTRA_CALL_ID, payload.callId);
    intent.putExtra(IncomingCallActivity.EXTRA_CALLER_NAME, payload.callerName);
    intent.putExtra(IncomingCallActivity.EXTRA_TITLE, payload.title);
    intent.putExtra(IncomingCallActivity.EXTRA_BODY, payload.body);
    intent.putExtra(IncomingCallActivity.EXTRA_CALL_TYPE, payload.callType);
    intent.putExtra(IncomingCallActivity.EXTRA_EXPIRES_AT, payload.expiresAt);
    intent.putExtra(IncomingCallActivity.EXTRA_ROOM_ID, payload.roomId);
    intent.putExtra(IncomingCallActivity.EXTRA_CALLER_ID, payload.callerId);
    intent.putExtra(IncomingCallActivity.EXTRA_CALLER_AVATAR_URL, payload.callerAvatarUrl);
    intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    return intent;
  }

  public static Intent buildIncomingCallActivityIntent(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) {
      return null;
    }
    Intent intent = new Intent(context, IncomingCallActivity.class);
    intent.putExtra(IncomingCallActivity.EXTRA_CALL_ID, payload.callId);
    intent.putExtra(IncomingCallActivity.EXTRA_CALLER_NAME, payload.callerName);
    intent.putExtra(IncomingCallActivity.EXTRA_TITLE, payload.title);
    intent.putExtra(IncomingCallActivity.EXTRA_BODY, payload.body);
    intent.putExtra(IncomingCallActivity.EXTRA_CALL_TYPE, payload.callType);
    intent.putExtra(IncomingCallActivity.EXTRA_EXPIRES_AT, payload.expiresAt);
    intent.putExtra(IncomingCallActivity.EXTRA_ROOM_ID, payload.roomId);
    intent.putExtra(IncomingCallActivity.EXTRA_CALLER_ID, payload.callerId);
    intent.putExtra(IncomingCallActivity.EXTRA_CALLER_AVATAR_URL, payload.callerAvatarUrl);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return intent;
  }

  public static Intent buildMainActivityLauncherIntent(Context context) {
    Intent launch = new Intent(context, MainActivity.class);
    launch.setAction(Intent.ACTION_MAIN);
    launch.addCategory(Intent.CATEGORY_LAUNCHER);
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return launch;
  }

  public static Intent buildMainActivityCallPreviewIntent(Context context, String callId) {
    String sessionId = callId != null ? callId.trim() : "";
    Intent launch = new Intent(context, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    launch.setData(Uri.parse("dibay://call/" + Uri.encode(sessionId) + "?incomingPreview=1"));
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return launch;
  }

  public static Intent buildMainActivityCallAcceptIntent(Context context, String callId) {
    String sessionId = callId != null ? callId.trim() : "";
    Intent launch = new Intent(context, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    launch.setData(
        Uri.parse(
            "dibay://call/"
                + Uri.encode(sessionId)
                + "?action=accept&nativeAccept=1&source=activity"));
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return launch;
  }
}
