package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

/** Shared intents for incoming call accept → web call route. */
public final class IncomingCallIntentHelper {
  private IncomingCallIntentHelper() {}

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

  public static Intent buildMainActivityCallAcceptIntent(Context context, String callId) {
    String sessionId = callId != null ? callId.trim() : "";
    Intent launch = new Intent(context, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    launch.setData(Uri.parse("dibay://call/" + Uri.encode(sessionId) + "?action=accept"));
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return launch;
  }
}
