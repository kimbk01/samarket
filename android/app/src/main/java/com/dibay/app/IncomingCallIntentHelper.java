package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

/** Shared intents for incoming call accept → web call route. */
public final class IncomingCallIntentHelper {
  private IncomingCallIntentHelper() {}

  public static Intent buildMainActivityCallAcceptIntent(Context context, String callId) {
    String sessionId = callId != null ? callId.trim() : "";
    Intent launch = new Intent(context, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    launch.setData(Uri.parse("dibay://call/" + Uri.encode(sessionId) + "?action=accept"));
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return launch;
  }
}
