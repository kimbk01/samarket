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
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;
import com.dibay.app.IncomingCallUiCopy;
import com.dibay.app.R;
import com.dibay.app.DibayNativeLocale;

/** Foreground service for native video calls. WebView is not involved. */
public class NativeVideoCallService extends Service {
  /**
   * Versioned FGS channel (CUT3). Old {@code dibay_native_video_call} stays unused for new posts —
   * OS does not allow lowering importance of an already-created HIGH channel in place.
   */
  public static final String CHANNEL_ID = "dibay_native_video_call_v2";
  /** @deprecated legacy HIGH channel id — do not create/post new ongoing FGS here. */
  public static final String LEGACY_CHANNEL_ID = "dibay_native_video_call";

  /** SSOT §5 — 통화 전용 알림 묶음. 일반 DIBAY 알림과 OS 자동 묶음 금지. */
  static final String CALL_NOTIFICATION_GROUP = "dibay.call.ongoing";
  /** 첫 연결 시각(벽시계) — 알림 통화 시간. STOP 에서 지운다. */
  private static final java.util.concurrent.ConcurrentHashMap<String, Long> CONNECTED_WALL_AT =
      new java.util.concurrent.ConcurrentHashMap<>();
  private static final int NOTIFICATION_ID = 96001;
  private static final String ACTION_RINGING = "com.dibay.app.nativevideo.RINGING";
  private static final String ACTION_CONNECTING = "com.dibay.app.nativevideo.CONNECTING";
  private static final String ACTION_CONNECTED = "com.dibay.app.nativevideo.CONNECTED";
  private static final String ACTION_STOP = "com.dibay.app.nativevideo.STOP";
  private static final String EXTRA_CALL_ID = "callId";
  /**
   * 소유권 정리 (call-termination-authority-audit §2-3, A5): FGS·진행 중 알림은 알림 ID 가 하나라서, 지금 이
   * 서비스를 쓰는 callId 를 기억하고 같은 callId 의 정지만 받는다. 다른 통화 정리가 현재 통화 FGS 를 끊지 않게 한다.
   */
  private static final Object OWNER_LOCK = new Object();
  private static volatile String ownerCallId;

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
    String sid = callId != null ? callId.trim() : "";
    synchronized (OWNER_LOCK) {
      String owner = ownerCallId;
      if (owner != null && !owner.equals(sid)) {
        NativeVideoCallLog.info(
            "native_call_service_stop_skip_foreign_owner",
            sid,
            "owner=" + owner + " reason=" + (reason != null ? reason : ""));
        return;
      }
      ownerCallId = null;
    }
    stopNow(context, sid, reason);
  }

  /** ⑥ 고아 회수 — 이 lane 에 살아 있는 세션이 0개일 때만 호출. 소유 기록과 관계없이 정지한다. */
  public static void stopOrphan(Context context, String reason) {
    if (context == null) return;
    String owner;
    synchronized (OWNER_LOCK) {
      owner = ownerCallId;
      ownerCallId = null;
    }
    NativeVideoCallLog.info(
        "native_call_service_orphan_stop", owner != null ? owner : "none", "reason=" + (reason != null ? reason : ""));
    stopNow(context, owner != null ? owner : "", reason);
  }

  /** 현재 FGS 소유 callId (없으면 null). Runtime 고아 회수·테스트용. */
  static String currentOwnerCallId() {
    return ownerCallId;
  }

  static void resetOwnerForTests() {
    ownerCallId = null;
  }

  private static void stopNow(Context context, String callId, String reason) {
    Intent intent = new Intent(context, NativeVideoCallService.class);
    intent.setAction(ACTION_STOP);
    intent.putExtra(EXTRA_CALL_ID, callId);
    intent.putExtra("reason", reason != null ? reason : "stop");
    context.startService(intent);
  }

  private static void start(Context context, String callId, String action) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    synchronized (OWNER_LOCK) {
      ownerCallId = callId.trim();
    }
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
      CONNECTED_WALL_AT.remove(callId);
      String owner = ownerCallId;
      if (owner != null && !owner.equals(callId)) {
        // 이전 통화의 STOP 이 새 통화 START 뒤에 도착 — 새 통화 FGS 를 끊지 않는다.
        NativeVideoCallLog.info("native_call_service_stop_intent_stale", callId, "owner=" + owner);
        return START_NOT_STICKY;
      }
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
    // SSOT docs/dibay-call-minimized-surface-cta-ssot.md §5 — 진행 중 통화 알림 = 통화 카드(CallStyle).
    // 제목 = 상대 이름, 본문 = 「영상 통화 중」(키), 통화 시간, 통화 전용 묶음(일반 알림과 자동 묶음 금지).
    // 채널·중요도·소리는 그대로(DEFAULT + onlyAlertOnce + silent — heads-up 없음, 사용자 채널 설정 보존).
    String sid = callId != null ? callId.trim() : "";
    NativeVideoCallRuntime.Session session = sid.isEmpty() ? null : NativeVideoCallRuntime.getSession(sid);
    String peerName =
        session != null && session.callerName != null && !session.callerName.trim().isEmpty()
            ? IncomingCallUiCopy.sanitizeNickname(session.callerName.trim())
            : "";
    if (peerName.isEmpty()) peerName = "DIBAY";
    boolean connected = ACTION_CONNECTED.equals(action);
    boolean connecting = ACTION_CONNECTING.equals(action);
    int textRes =
        connected
            ? R.string.dibay_call_ch_video_ongoing_name
            : connecting ? R.string.dibay_video_call_connecting : R.string.dibay_video_call_incoming;
    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(peerName)
            .setContentText(DibayNativeLocale.string(this, textRes))
            .setOngoing(!ACTION_RINGING.equals(action))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setGroup(CALL_NOTIFICATION_GROUP)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setSound(null)
            .setVibrate(null);
    if (connected && !sid.isEmpty()) {
      Long at = CONNECTED_WALL_AT.get(sid);
      if (at == null) {
        at = System.currentTimeMillis();
        CONNECTED_WALL_AT.put(sid, at);
      }
      builder.setWhen(at).setShowWhen(true).setUsesChronometer(true);
    }

    // CONNECTING + CONNECTED: return-to-call + hangup (zombie guard — a live FGS must always offer hangup).
    if ((connected || connecting) && !sid.isEmpty()) {
      PendingIntent contentPi = returnToCallIntent(sid, session, action);
      if (contentPi != null) {
        builder.setContentIntent(contentPi);
      }
      PendingIntent hangUpPi = hangUpIntent(sid);
      if (hangUpPi != null) {
        String endLabel = DibayNativeLocale.string(this, R.string.dibay_call_end_call);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          try {
            Person person = new Person.Builder().setName(peerName).setImportant(true).build();
            builder.setStyle(
                NotificationCompat.CallStyle.forOngoingCall(person, hangUpPi).setIsVideo(true));
          } catch (IllegalArgumentException | IllegalStateException error) {
            NativeVideoCallLog.warn(
                "ongoing_notification_callstyle_failed", sid, "err=" + error.getClass().getSimpleName());
            builder.addAction(new NotificationCompat.Action.Builder(R.drawable.ic_call_end, endLabel, hangUpPi).build());
          }
        } else {
          builder.addAction(new NotificationCompat.Action.Builder(R.drawable.ic_call_end, endLabel, hangUpPi).build());
        }
      }
    }

    return builder.build();
  }

  private PendingIntent returnToCallIntent(
      String callId, NativeVideoCallRuntime.Session session, String action) {
    if (session == null) return null;
    Intent intent = new Intent(this, NativeVideoCallActivity.class);
    intent.setFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    intent.putExtra(NativeVideoCallActivity.EXTRA_CALL_ID, callId);
    if (ACTION_CONNECTED.equals(action)) {
      intent.putExtra(NativeVideoCallActivity.EXTRA_UI_MODE, NativeVideoCallActivity.UI_MODE_CONNECTED_RESTORE);
    } else {
      intent.putExtra(
          NativeVideoCallActivity.EXTRA_UI_MODE,
          session.initiator
              ? NativeVideoCallActivity.UI_MODE_OUTGOING
              : NativeVideoCallActivity.UI_MODE_INCOMING);
    }
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
    // DEFAULT — status-bar / shade ongoing only (heads-up requires HIGH). Voice FGS parity.
    NotificationChannel channel =
        new NotificationChannel(
            CHANNEL_ID, DibayNativeLocale.string(this, R.string.dibay_call_ch_video_ongoing_name), NotificationManager.IMPORTANCE_DEFAULT);
    channel.setDescription(DibayNativeLocale.string(this, R.string.dibay_call_ch_video_ongoing_desc));
    channel.setSound(null, null);
    channel.enableVibration(false);
    channel.setShowBadge(false);
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
    NativeVideoCallLog.corr("RB3", callId, "event=fgs_audio_focus_request");
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
