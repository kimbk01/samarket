package com.dibay.app.nativevoice;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import com.dibay.app.R;

/** Foreground service for native voice calls. WebView is not involved. */
public class NativeVoiceCallService extends Service {
  private static final String CHANNEL_ID = "dibay_native_voice_call";
  private static final int NOTIFICATION_ID = 93001;
  private static final String ACTION_RINGING = "com.dibay.app.nativevoice.RINGING";
  private static final String ACTION_CONNECTING = "com.dibay.app.nativevoice.CONNECTING";
  private static final String ACTION_CONNECTED = "com.dibay.app.nativevoice.CONNECTED";
  private static final String ACTION_STOP = "com.dibay.app.nativevoice.STOP";
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
    Intent intent = new Intent(context, NativeVoiceCallService.class);
    intent.setAction(ACTION_STOP);
    intent.putExtra(EXTRA_CALL_ID, callId);
    intent.putExtra("reason", reason != null ? reason : "stop");
    context.startService(intent);
  }

  private static void start(Context context, String callId, String action) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Intent intent = new Intent(context, NativeVoiceCallService.class);
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
    String action = intent != null ? intent.getAction() : "";
    String callId = intent != null ? intent.getStringExtra(EXTRA_CALL_ID) : "unknown";
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
    startForeground(NOTIFICATION_ID, buildNotification(callId, action));
    return START_STICKY;
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private Notification buildNotification(String callId, String action) {
    String title =
        ACTION_CONNECTED.equals(action)
            ? "DIBAY voice call"
            : ACTION_CONNECTING.equals(action) ? "DIBAY voice connecting" : "DIBAY incoming call";
    // No CallStyle / no contentIntent / no hangup action — this notification exists only to
    // satisfy the Android foreground-service requirement (call keeps running in background).
    // setOnlyAlertOnce(true) stops it from heads-up-popping again on every RINGING->CONNECTING->
    // CONNECTED state re-post to the same NOTIFICATION_ID.
    return new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(title)
        .setContentText("Native voice runtime")
        .setOngoing(!ACTION_RINGING.equals(action))
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setOnlyAlertOnce(true)
        .build();
  }

  private void ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
    // LOW — this channel is only the foreground-service-required notification (this class),
    // never the actual incoming-ring alert (that is NativeVoiceCallNotification's separate
    // dibay_native_voice_incoming channel). LOW = no heads-up popup, no sound, from this channel.
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "DIBAY Native Voice", NotificationManager.IMPORTANCE_LOW);
    channel.setDescription("Native voice call runtime");
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
    NativeVoiceCallLog.info("audio_route_applied", callId, "focus=voice");
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
}
