package com.dibay.app.nativevideo;

import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Rational;
import com.dibay.app.R;
import java.util.Collections;

/** Android PiP presentation adapter for Native Video UI. No Runtime ownership. */
public final class NativeVideoCallPipPresenter {
  private static final Rational VIDEO_ASPECT_RATIO = new Rational(9, 16);

  private NativeVideoCallPipPresenter() {}

  public static PictureInPictureParams buildParams(Context context, String callId) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context == null || callId == null) {
      return null;
    }
    PictureInPictureParams.Builder builder =
        new PictureInPictureParams.Builder()
            .setAspectRatio(VIDEO_ASPECT_RATIO)
            .setActions(Collections.singletonList(buildEndAction(context, callId)));
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setSeamlessResizeEnabled(true);
    }
    return builder.build();
  }

  private static RemoteAction buildEndAction(Context context, String callId) {
    Intent intent = new Intent(context, NativeVideoCallActionReceiver.class);
    intent.setAction(NativeVideoCallActionReceiver.ACTION_END);
    intent.putExtra(NativeVideoCallActivity.EXTRA_CALL_ID, callId);
    PendingIntent pendingIntent =
        PendingIntent.getBroadcast(
            context,
            callId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag());
    Icon icon = Icon.createWithResource(context, android.R.drawable.ic_menu_close_clear_cancel);
    String label = context.getString(R.string.dibay_video_call_end);
    return new RemoteAction(icon, label, label, pendingIntent);
  }

  private static int immutableFlag() {
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
  }
}
