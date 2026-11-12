package com.dibay.app.nativevideo;

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
 * Android PiP presentation adapter for Native Video UI. No Runtime ownership.
 *
 * <p>SSOT {@code docs/dibay-call-minimized-surface-cta-ssot.md} §3 · §4 · §4-1: 버튼 = 마이크 · 카메라 · 통화
 * 종료(수화기 {@code ic_call_end}, X 모양 금지). CONNECTED 동안만 자동 PiP.
 */
public final class NativeVideoCallPipPresenter {
  private static final Rational VIDEO_ASPECT_RATIO = new Rational(9, 16);

  private NativeVideoCallPipPresenter() {}

  public static PictureInPictureParams buildParams(
      Context context,
      String callId,
      boolean micMuted,
      boolean cameraEnabled,
      boolean autoEnter,
      int maxActions) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context == null || callId == null) {
      return null;
    }
    PictureInPictureParams.Builder builder =
        new PictureInPictureParams.Builder()
            .setAspectRatio(VIDEO_ASPECT_RATIO)
            .setActions(buildActions(context, callId, micMuted, cameraEnabled, maxActions));
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setSeamlessResizeEnabled(true);
      builder.setAutoEnterEnabled(autoEnter);
    }
    return builder.build();
  }

  @RequiresApi(Build.VERSION_CODES.O)
  private static List<RemoteAction> buildActions(
      Context context, String callId, boolean micMuted, boolean cameraEnabled, int maxActions) {
    List<RemoteAction> out = new ArrayList<>(3);
    for (CallPipActionPlan.Action action : CallPipActionPlan.plan(true, cameraEnabled, maxActions)) {
      switch (action) {
        case MIC:
          out.add(
              remoteAction(
                  context,
                  callId,
                  NativeVideoCallActionReceiver.ACTION_PIP_MIC,
                  micMuted ? R.drawable.ic_call_mic_off : R.drawable.ic_call_mic_on,
                  micMuted ? R.string.dibay_call_control_unmute : R.string.dibay_call_control_mute,
                  1));
          break;
        case CAMERA:
          out.add(
              remoteAction(
                  context,
                  callId,
                  NativeVideoCallActionReceiver.ACTION_PIP_CAMERA,
                  cameraEnabled ? R.drawable.ic_call_video : R.drawable.ic_call_video_off,
                  cameraEnabled ? R.string.dibay_video_camera_off : R.string.dibay_video_camera_on,
                  2));
          break;
        case END:
        default:
          out.add(
              remoteAction(
                  context,
                  callId,
                  NativeVideoCallActionReceiver.ACTION_END,
                  R.drawable.ic_call_end,
                  R.string.dibay_call_end_call,
                  3));
          break;
      }
    }
    return out;
  }

  @RequiresApi(Build.VERSION_CODES.O)
  private static RemoteAction remoteAction(
      Context context, String callId, String intentAction, int iconRes, int labelRes, int slot) {
    Intent intent = new Intent(context, NativeVideoCallActionReceiver.class);
    intent.setAction(intentAction);
    intent.putExtra(NativeVideoCallActivity.EXTRA_CALL_ID, callId);
    intent.putExtra(NativeVideoCallActionReceiver.EXTRA_SOURCE, NativeVideoCallActionReceiver.SOURCE_PIP);
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
