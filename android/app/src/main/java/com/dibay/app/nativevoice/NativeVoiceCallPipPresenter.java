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
import com.dibay.app.DibayNativeLocale;
import com.dibay.app.R;
import com.dibay.app.call.CallPipActionPlan;
import java.util.ArrayList;
import java.util.List;

/**
 * S2 P2 — Native Voice 통화 화면 PiP 파라미터 (영상 NativeVideoCallPipPresenter 와 같은 구조). No Runtime ownership.
 *
 * <p>SSOT {@code docs/dibay-call-minimized-surface-cta-ssot.md} §3 · §4-1: 버튼 = 마이크 · 통화 종료(수화기
 * {@code ic_call_end}, X 모양 금지). CONNECTED 동안만 자동 PiP.
 */
public final class NativeVoiceCallPipPresenter {
  private static final Rational VOICE_ASPECT_RATIO = new Rational(3, 4);

  private NativeVoiceCallPipPresenter() {}

  public static PictureInPictureParams buildParams(
      Context context, String callId, boolean micMuted, boolean autoEnter, int maxActions) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context == null || callId == null) {
      return null;
    }
    PictureInPictureParams.Builder builder =
        new PictureInPictureParams.Builder()
            .setAspectRatio(VOICE_ASPECT_RATIO)
            .setActions(buildActions(context, callId, micMuted, maxActions));
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(autoEnter);
    }
    return builder.build();
  }

  @RequiresApi(Build.VERSION_CODES.O)
  private static List<RemoteAction> buildActions(
      Context context, String callId, boolean micMuted, int maxActions) {
    List<RemoteAction> out = new ArrayList<>(2);
    for (CallPipActionPlan.Action action : CallPipActionPlan.plan(false, false, maxActions)) {
      if (action == CallPipActionPlan.Action.MIC) {
        out.add(
            remoteAction(
                context,
                callId,
                NativeVoiceCallActionReceiver.ACTION_PIP_MIC,
                micMuted ? R.drawable.ic_call_mic_off : R.drawable.ic_call_mic_on,
                micMuted ? R.string.dibay_call_control_unmute : R.string.dibay_call_control_mute,
                1));
      } else if (action == CallPipActionPlan.Action.END) {
        out.add(
            remoteAction(
                context,
                callId,
                NativeVoiceCallActionReceiver.ACTION_END,
                R.drawable.ic_call_end,
                R.string.dibay_call_end_call,
                3));
      }
    }
    return out;
  }

  @RequiresApi(Build.VERSION_CODES.O)
  private static RemoteAction remoteAction(
      Context context, String callId, String intentAction, int iconRes, int labelRes, int slot) {
    Intent intent = new Intent(context, NativeVoiceCallActionReceiver.class);
    intent.setAction(intentAction);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, callId);
    intent.putExtra(NativeVoiceCallActionReceiver.EXTRA_SOURCE, NativeVoiceCallActionReceiver.SOURCE_PIP);
    PendingIntent pendingIntent =
        PendingIntent.getBroadcast(
            context,
            ("pip_" + slot + "_" + callId).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    Icon icon = Icon.createWithResource(context, iconRes);
    String label = DibayNativeLocale.string(context, labelRes);
    return new RemoteAction(icon, label, label, pendingIntent);
  }
}
