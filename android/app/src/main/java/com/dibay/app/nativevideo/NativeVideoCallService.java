package com.dibay.app.nativevideo;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.dibay.app.R;

/** Foreground service for native video calls. WebView is not involved. */
public class NativeVideoCallService extends Service {
  private static final String CHANNEL_ID = "dibay_native_video_call";
  private static final int NOTIFICATION_ID = 96001;
  private static final String ACTION_RINGING = "com.dibay.app.nativevideo.RINGING";
  private static final String ACTION_CONNECTING = "com.dibay.app.nativevideo.CONNECTING";
  private static final String ACTION_CONNECTED = "com.dibay.app.nativevideo.CONNECTED";
  private static final String ACTION_STOP = "com.dibay.app.nativevideo.STOP";
  private static final String EXTRA_CALL_ID = "callId";

  private AudioFocusRequest audioFocusRequest;

  public static void startRinging(Context context, String callId) {
    start(context, callId, ACTION_RINGING);
  }

  public static void startConnecting(Context context, String callId) {
    start(context, callId, ACTION_CONNECTING);
  }

  public static void startConnected(Context context, String callId) {
    start(context, callId, ACTION_CONNECTED);
  }

  public static void stop(Context context, String callId, String reason) {
    if (context == null) return;
    Intent intent = new Intent(context, NativeVideoCallService.class);
    intent.setAction(ACTION_STOP);
    intent.putExtra(EXTRA_CALL_ID, callId);
    intent.putExtra("reason", reason != null ? reason : "stop");
    context.startService(intent);
  }

  private static void start(Context context, String callId, String action) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Intent intent = new Intent(context, NativeVideoCallService.class);
    intent.setAction(action);
    intent.putExtra(EXTRA_CALL_ID, callId.trim());
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent);
    } else {
      context.startService(intent);
    }
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) {
      // START_STICKY restart with null intent — do not re-promote ghost FGS.
      releaseAudioFocus();
      stopForeground(true);
      stopSelf();
      return START_NOT_STICKY;
    }
    String action = intent.getAction() != null ? intent.getAction() : "";
    String callId = intent.getStringExtra(EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) {
      callId = "unknown";
    }
    if (ACTION_STOP.equals(action)) {
      releaseAudioFocus();
      stopForeground(true);
      stopSelf();
      return START_NOT_STICKY;
    }
    ensureChannel();
    if (ACTION_CONNECTED.equals(action) || ACTION_CONNECTING.equals(action)) {
      requestAudioFocus(callId);
    }
    promoteForeground(callId, buildNotification(callId, action));
    return START_NOT_STICKY;
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private Notification buildNotification(String callId, String action) {
    String title =
        ACTION_CONNECTED.equals(action)
            ? "DIBAY video call"
            : ACTION_CONNECTING.equals(action) ? "DIBAY video connecting" : "DIBAY incoming video call";
    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText("Native video runtime")
            .setOngoing(!ACTION_RINGING.equals(action))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL);

    if (ACTION_CONNECTED.equals(action) && hasConnectedSession(callId)) {
      String sid = callId.trim();
      NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(sid);
      PendingIntent contentPi = returnToCallIntent(sid, session);
      if (contentPi != null) {
        builder.setContentIntent(contentPi);
      }
      PendingIntent hangUpPi = hangUpIntent(sid);
      if (hangUpPi != null) {
        builder.addAction(
            new NotificationCompat.Action.Builder(
                    0, getString(R.string.dibay_video_call_end), hangUpPi)
                .build());
      }
    }

    return builder.build();
  }

  private boolean hasConnectedSession(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId.trim());
    return session != null && session.state == NativeVideoCallRuntime.State.CONNECTED;
  }

  private PendingIntent returnToCallIntent(String callId, NativeVideoCallRuntime.Session session) {
    if (session == null || session.state != NativeVideoCallRuntime.State.CONNECTED) return null;
    Intent intent = new Intent(this, NativeVideoCallActivity.class);
    intent.setFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    intent.putExtra(NativeVideoCallActivity.EXTRA_CALL_ID, callId);
    intent.putExtra(NativeVideoCallActivity.EXTRA_UI_MODE, NativeVideoCallActivity.UI_MODE_CONNECTED_RESTORE);
    intent.putExtra("roomId", session.roomId);
    intent.putExtra("callerId", session.callerId);
    intent.putExtra("callerName", session.callerName);
    intent.putExtra("mediaType", session.mediaType);
    return PendingIntent.getActivity(
        this,
        (callId + ":ongoing_content").hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private PendingIntent hangUpIntent(String callId) {
    Intent intent = new Intent(this, NativeVideoCallActionReceiver.class);
    intent.setAction(NativeVideoCallActionReceiver.ACTION_END);
    intent.putExtra(NativeVideoCallActivity.EXTRA_CALL_ID, callId);
    return PendingIntent.getBroadcast(
        this,
        (callId + ":ongoing_hangup").hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private void promoteForeground(String callId, Notification notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      int type = android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL;
      if (hasRecordAudioPermission()) {
        type |= android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && hasCameraPermission()) {
        type |= android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
      }
      try {
        startForeground(NOTIFICATION_ID, notification, type);
        return;
      } catch (RuntimeException error) {
        NativeVideoCallLog.warn("foreground_service_type_fallback", callId, "err=" + error.getClass().getSimpleName());
      }
    }
    startForeground(NOTIFICATION_ID, notification);
  }

  private void ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "DIBAY Native Video", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Native video call runtime");
    manager.createNotificationChannel(channel);
  }

  private void requestAudioFocus(String callId) {
    AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
    if (audioManager == null) return;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      AudioAttributes attrs =
          new AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build();
      audioFocusRequest =
          new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
              .setAudioAttributes(attrs)
              .build();
      audioManager.requestAudioFocus(audioFocusRequest);
    } else {
      audioManager.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
    }
    NativeVideoCallLog.info("audio_route_applied", callId, "focus=video");
  }

  private void releaseAudioFocus() {
    AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
    if (audioManager == null) return;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
      audioManager.abandonAudioFocusRequest(audioFocusRequest);
      audioFocusRequest = null;
    } else {
      audioManager.abandonAudioFocus(null);
    }
  }

  private boolean hasRecordAudioPermission() {
    return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
        == PackageManager.PERMISSION_GRANTED;
  }

  private boolean hasCameraPermission() {
    return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
        == PackageManager.PERMISSION_GRANTED;
  }
}
