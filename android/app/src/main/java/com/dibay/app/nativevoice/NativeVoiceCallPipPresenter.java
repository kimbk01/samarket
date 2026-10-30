package com.dibay.app.nativevoice;

import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Rational;
import androidx.annotation.RequiresApi;
import com.dibay.app.R;
import java.util.Collections;

/** S2 P2 — Native Voice 통화 화면 PiP 파라미터 (영상 NativeVideoCallPipPresenter 와 같은 구조). No Runtime ownership. */
public final class NativeVoiceCallPipPresenter {
  private static final Rational VOICE_ASPECT_RATIO = new Rational(3, 4);

  private NativeVoiceCallPipPresenter() {}

  public static PictureInPictureParams buildParams(Context context, String callId) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context == null || callId == null) {
      return null;
    }
    return new PictureInPictureParams.Builder()
        .setAspectRatio(VOICE_ASPECT_RATIO)
        .setActions(Collections.singletonList(buildEndAction(context, callId)))
        .build();
  }

  @RequiresApi(Build.VERSION_CODES.O)
  private static RemoteAction buildEndAction(Context context, String callId) {
    Intent intent = new Intent(context, NativeVoiceCallActionReceiver.class);
    intent.setAction(NativeVoiceCallActionReceiver.ACTION_END);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, callId);
    PendingIntent pendingIntent =
        PendingIntent.getBroadcast(
            context,
            ("pip_end_" + callId).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Icon icon = Icon.createWithResource(context, android.R.drawable.ic_menu_close_clear_cancel);
    String label = context.getString(R.string.dibay_voice_call_end);
    return new RemoteAction(icon, label, label, pendingIntent);
  }
}
