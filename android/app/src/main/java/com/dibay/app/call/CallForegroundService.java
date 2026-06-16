package com.dibay.app.call;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.Manifest;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.dibay.app.CallSessionPatchHelper;
import com.dibay.app.DibayCallLog;
import com.dibay.app.DibayCallPushLog;
import com.dibay.app.DibayIncomingCallNativeStore;
import com.dibay.app.IncomingCallIntentHelper;
import com.dibay.app.IncomingCallNotificationBuilder;
import com.dibay.app.MainActivity;
import com.dibay.app.R;
import java.util.concurrent.atomic.AtomicReference;

/** callId 단일 소유 — WebView 생명주기와 무관하게 통화 생존/종료 */
public class CallForegroundService extends Service {
  public static final String ACTION_START = "com.dibay.app.call.ACTION_START";
  public static final String ACTION_END = "com.dibay.app.call.ACTION_END";
  public static final String ACTION_HEARTBEAT = "com.dibay.app.call.ACTION_HEARTBEAT";
  public static final String ACTION_START_RINGING = "com.dibay.app.call.ACTION_START_RINGING";
  public static final String ACTION_STOP_RINGING = "com.dibay.app.call.ACTION_STOP_RINGING";
  public static final String EXTRA_CALL_ID = "callId";
  public static final String EXTRA_CALL_KIND = "callKind";
  public static final String EXTRA_PHASE = "phase";

  private static final String TAG = "DIBAY_CALL";
  private static final String CHANNEL_ID = "dibay_active_call";
  private static final int NOTIFICATION_ID = 92001;
  private static final long HEARTBEAT_TIMEOUT_MS = 35_000L;
  private static final AtomicReference<String> ACTIVE_CALL_ID = new AtomicReference<>(null);
  private static final AtomicReference<String> FOREGROUND_STARTED_FOR = new AtomicReference<>(null);
  private static final AtomicReference<String> RINGING_FOREGROUND_FOR = new AtomicReference<>(null);
  private static final AtomicReference<String> ACTIVE_CALL_KIND = new AtomicReference<>("voice");

  private Handler heartbeatHandler;
  private Runnable heartbeatWatchdogRunnable;
  private long lastHeartbeatAtMs;
  private volatile boolean taskRemovedKeepAlive;

  public static String getActiveCallId() {
    String id = ACTIVE_CALL_ID.get();
    return id != null ? id : "";
  }

  public static void start(Context context, String callId, String callKind, String phase) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String current = ACTIVE_CALL_ID.get();
    String foregroundFor = FOREGROUND_STARTED_FOR.get();
    if (current != null && current.equals(sid) && sid.equals(foregroundFor)) {
      DibayCallLog.once("call_service_already_running", sid, "source=fgs_start");
      Log.i(TAG, "[DIBAY_CALL] call_service_already_running callId=" + sid);
      return;
    }
    ACTIVE_CALL_ID.set(sid);
    ACTIVE_CALL_KIND.set(callKind != null ? callKind : "voice");
    Intent intent = new Intent(context, CallForegroundService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_CALL_ID, sid);
    intent.putExtra(EXTRA_CALL_KIND, callKind != null ? callKind : "voice");
    intent.putExtra(EXTRA_PHASE, phase != null ? phase : "active");
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent);
    } else {
      context.startService(intent);
    }
  }

  public static void startRinging(Context context, String callId, String callKind) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    if (sid.equals(RINGING_FOREGROUND_FOR.get())) {
      DibayCallPushLog.info("foreground_service_started_ringing", sid, "ok=true reused=true");
      return;
    }
    ACTIVE_CALL_ID.set(sid);
    ACTIVE_CALL_KIND.set(callKind != null ? callKind : "voice");
    Intent intent = new Intent(context, CallForegroundService.class);
    intent.setAction(ACTION_START_RINGING);
    intent.putExtra(EXTRA_CALL_ID, sid);
    intent.putExtra(EXTRA_CALL_KIND, callKind != null ? callKind : "voice");
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent);
    } else {
      context.startService(intent);
    }
  }

  public static void stopRinging(Context context, String callId, String reason) {
    if (context == null) return;
    Intent intent = new Intent(context, CallForegroundService.class);
    intent.setAction(ACTION_STOP_RINGING);
    if (callId != null) intent.putExtra(EXTRA_CALL_ID, callId.trim());
    intent.putExtra("reason", reason != null ? reason : "ringing_end");
    context.startService(intent);
  }

  public static void heartbeat(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Intent intent = new Intent(context, CallForegroundService.class);
    intent.setAction(ACTION_HEARTBEAT);
    intent.putExtra(EXTRA_CALL_ID, callId.trim());
    context.startService(intent);
  }

  public static void stop(Context context, String callId, String reason) {
    if (context == null) return;
    Intent intent = new Intent(context, CallForegroundService.class);
    intent.setAction(ACTION_END);
    if (callId != null) intent.putExtra(EXTRA_CALL_ID, callId.trim());
    intent.putExtra("reason", reason != null ? reason : "client_end");
    context.startService(intent);
  }

  @Override
  public void onCreate() {
    super.onCreate();
    heartbeatHandler = new Handler(Looper.getMainLooper());
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) {
      // START_STICKY 재시작 시 intent null — startForeground 미호출이면 5초 내 프로세스 kill
      stopSelf();
      return START_NOT_STICKY;
    }
    String action = intent.getAction();
    String callId = intent.getStringExtra(EXTRA_CALL_ID);

    if (ACTION_HEARTBEAT.equals(action)) {
      if (callId != null && !callId.trim().isEmpty()) {
        String sid = callId.trim();
        String active = ACTIVE_CALL_ID.get();
        if (active != null && active.equals(sid)) {
          lastHeartbeatAtMs = System.currentTimeMillis();
          DibayCallLog.always("call_heartbeat_ping", sid, "source=fgs");
          scheduleHeartbeatWatchdog();
        }
      }
      return START_STICKY;
    }

    if (ACTION_START_RINGING.equals(action)) {
      startRingingForeground(callId, intent.getStringExtra(EXTRA_CALL_KIND));
      return START_STICKY;
    }

    if (ACTION_STOP_RINGING.equals(action)) {
      stopRingingForeground(callId, intent.getStringExtra("reason"));
      return START_NOT_STICKY;
    }

    if (ACTION_END.equals(action)) {
      endCallAndStop(callId, intent.getStringExtra("reason"));
      return START_NOT_STICKY;
    }

    if (callId == null || callId.trim().isEmpty()) {
      stopSelf();
      return START_NOT_STICKY;
    }
    String sid = callId.trim();
    ACTIVE_CALL_ID.set(sid);
    RINGING_FOREGROUND_FOR.set(null);
    DibayIncomingCallNativeStore.markState(this, sid, DibayIncomingCallNativeStore.STATE_ACTIVE);

    String foregroundFor = FOREGROUND_STARTED_FOR.get();
    if (sid.equals(foregroundFor)) {
      DibayCallLog.once("call_service_already_running", sid, "source=fgs_onStartCommand");
      Log.i(TAG, "[DIBAY_CALL] call_service_already_running callId=" + sid + " source=onStartCommand");
      return START_STICKY;
    }

    ensureChannel();
    String kind = intent.getStringExtra(EXTRA_CALL_KIND);
    ACTIVE_CALL_KIND.set(kind != null ? kind : "voice");
    Notification notification = buildOngoingCallNotification(sid, kind);
    if (!promoteToForeground(sid, notification, resolveActiveForegroundServiceType())) {
      endCallAndStop(sid, "fgs_start_failed");
      return START_NOT_STICKY;
    }
    FOREGROUND_STARTED_FOR.set(sid);
    lastHeartbeatAtMs = System.currentTimeMillis();
    scheduleHeartbeatWatchdog();
    DibayCallLog.once("foreground_service_started", sid, "source=fgs");
    DibayCallLog.once("call_service_start", sid, "source=fgs");
    return START_STICKY;
  }

  @Override
  public void onTaskRemoved(Intent rootIntent) {
    String sid = ACTIVE_CALL_ID.get();
    taskRemovedKeepAlive = sid != null && !sid.isEmpty();
    DibayCallLog.once("app_swipe_detected", sid != null ? sid : "unknown", "source=fgs");
    DibayCallLog.once("task_removed_keep_foreground_service", sid != null ? sid : "unknown", "source=fgs");
    Log.i(TAG, "[DIBAY_CALL] task_removed_keep_foreground_service callId=" + sid);
    if (sid != null && !sid.isEmpty()) {
      String kind = ACTIVE_CALL_KIND.get();
      boolean ringingOnly = sid.equals(RINGING_FOREGROUND_FOR.get()) && !sid.equals(FOREGROUND_STARTED_FOR.get());
      Notification notification =
          ringingOnly ? buildRingingCallNotification(sid, kind) : buildOngoingCallNotification(sid, kind);
      int type =
          ringingOnly
              ? android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
              : resolveActiveForegroundServiceType();
      if (!promoteToForeground(sid, notification, type)) {
        Log.w(TAG, "[DIBAY_CALL] task_removed_keep_foreground_failed callId=" + sid);
      } else {
        String appPath =
            "/community-messenger/calls/"
                + android.net.Uri.encode(sid)
                + (ringingOnly ? "?action=accept&nativeAccept=1&source=native_resume" : "?source=native_resume");
        MainActivity.persistCallPendingRoute(getApplicationContext(), appPath, null, 0L);
        DibayCallPushLog.info("pending_route_saved", sid, "path=" + appPath);
      }
    }
    super.onTaskRemoved(rootIntent);
  }

  @Override
  public void onDestroy() {
    cancelHeartbeatWatchdog();
    String sid = ACTIVE_CALL_ID.getAndSet(null);
    FOREGROUND_STARTED_FOR.set(null);
    RINGING_FOREGROUND_FOR.set(null);
    ACTIVE_CALL_KIND.set("voice");
    taskRemovedKeepAlive = false;
    if (sid != null) {
      DibayCallLog.once("foreground_service_stopped", sid, "source=onDestroy");
      DibayCallLog.once("call_service_stop", sid, "source=onDestroy");
    }
    super.onDestroy();
  }

  private Notification buildRingingCallNotification(String callId, String kind) {
    String sid = callId != null ? callId.trim() : "";
    String label = "video".equalsIgnoreCase(kind) ? "영상 통화 수신 중" : "음성 통화 수신 중";
    int pendingFlags =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
    PendingIntent contentIntent =
        PendingIntent.getActivity(
            this,
            NOTIFICATION_ID + 2,
            IncomingCallIntentHelper.buildMainActivityCallAcceptIntent(this, sid),
            pendingFlags);
    PendingIntent endIntent =
        PendingIntent.getService(
            this,
            NOTIFICATION_ID + 3,
            IncomingCallIntentHelper.buildCallForegroundEndIntent(this, sid, "notification_reject"),
            pendingFlags);
    return new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("DIBAY 통화")
        .setContentText(label)
        .setOngoing(true)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setContentIntent(contentIntent)
        .addAction(android.R.drawable.ic_menu_call, "수락", contentIntent)
        .addAction(android.R.drawable.ic_menu_close_clear_cancel, "거절", endIntent)
        .build();
  }

  private Notification buildOngoingCallNotification(String callId, String kind) {
    String sid = callId != null ? callId.trim() : "";
    String label = "video".equalsIgnoreCase(kind) ? "영상 통화" : "음성 통화";
    int pendingFlags =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
    PendingIntent contentIntent =
        PendingIntent.getActivity(
            this,
            NOTIFICATION_ID,
            IncomingCallIntentHelper.buildMainActivityCallResumeIntent(this, sid),
            pendingFlags);
    PendingIntent endIntent =
        PendingIntent.getService(
            this,
            NOTIFICATION_ID + 1,
            IncomingCallIntentHelper.buildCallForegroundEndIntent(this, sid, "notification_end"),
            pendingFlags);
    return new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("DIBAY 통화")
        .setContentText(label + " 진행 중 · 탭하여 복귀")
        .setOngoing(true)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setContentIntent(contentIntent)
        .addAction(android.R.drawable.ic_menu_close_clear_cancel, "종료", endIntent)
        .build();
  }

  private void scheduleHeartbeatWatchdog() {
    if (heartbeatHandler == null) return;
    cancelHeartbeatWatchdog();
    heartbeatWatchdogRunnable =
        () -> {
          long elapsed = System.currentTimeMillis() - lastHeartbeatAtMs;
          if (elapsed >= HEARTBEAT_TIMEOUT_MS - 500L) {
            if (taskRemovedKeepAlive) {
              long delay = Math.max(HEARTBEAT_TIMEOUT_MS - elapsed, 5_000L);
              heartbeatHandler.postDelayed(heartbeatWatchdogRunnable, delay);
              return;
            }
            String sid = ACTIVE_CALL_ID.get();
            DibayCallLog.once(
                "call_heartbeat_timeout",
                sid != null ? sid : "unknown",
                "source=fgs elapsed=" + elapsed);
            Log.i(TAG, "[DIBAY_CALL] call_heartbeat_timeout callId=" + sid + " elapsed=" + elapsed);
            endCallAndStop(sid, "heartbeat_timeout");
          } else {
            long delay = HEARTBEAT_TIMEOUT_MS - elapsed;
            heartbeatHandler.postDelayed(heartbeatWatchdogRunnable, Math.max(delay, 1_000L));
          }
        };
    heartbeatHandler.postDelayed(heartbeatWatchdogRunnable, HEARTBEAT_TIMEOUT_MS);
  }

  private void cancelHeartbeatWatchdog() {
    if (heartbeatHandler != null && heartbeatWatchdogRunnable != null) {
      heartbeatHandler.removeCallbacks(heartbeatWatchdogRunnable);
      heartbeatWatchdogRunnable = null;
    }
  }

  private void endCallAndStop(String callId, String reason) {
    cancelHeartbeatWatchdog();
    taskRemovedKeepAlive = false;
    final String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : ACTIVE_CALL_ID.get();
    if (sid != null && !sid.isEmpty()) {
      IncomingCallNotificationBuilder.dismissIncomingCall(this, sid);
      CallActivityRouter.clearRouteLatch(sid);
      new Thread(
              () -> {
                boolean ok = CallSessionPatchHelper.patch(getApplicationContext(), sid, "end");
                if (ok) {
                  DibayCallLog.once("call_end_sent_to_peer", sid, "reason=" + reason);
                  Log.i(TAG, "[DIBAY_CALL] call_end_sent_to_peer callId=" + sid);
                }
              })
          .start();
    }
    ACTIVE_CALL_ID.set(null);
    FOREGROUND_STARTED_FOR.set(null);
    RINGING_FOREGROUND_FOR.set(null);
    ACTIVE_CALL_KIND.set("voice");
    if (sid != null) {
      DibayIncomingCallNativeStore.clear(this, sid, reason);
    }
    stopForeground(true);
    stopSelf();
    if (sid != null) {
      DibayCallLog.once("foreground_service_stopped", sid, "reason=" + reason);
      DibayCallLog.once("call_service_stop", sid, "reason=" + reason);
    }
  }

  private void startRingingForeground(String callId, String kind) {
    if (callId == null || callId.trim().isEmpty()) {
      stopSelf();
      return;
    }
    String sid = callId.trim();
    ACTIVE_CALL_ID.set(sid);
    ACTIVE_CALL_KIND.set(kind != null ? kind : "voice");
    ensureChannel();
    Notification notification = buildRingingCallNotification(sid, kind);
    if (!promoteToForeground(
        sid, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)) {
      stopSelf();
      return;
    }
    RINGING_FOREGROUND_FOR.set(sid);
    DibayCallPushLog.info("foreground_service_started_ringing", sid, "ok=true phase=ringing");
    DibayCallLog.once("foreground_service_started", sid, "phase=ringing");
  }

  private void stopRingingForeground(String callId, String reason) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : RINGING_FOREGROUND_FOR.get();
    if (sid == null || sid.isEmpty()) return;
    if (!sid.equals(RINGING_FOREGROUND_FOR.get())) return;
    RINGING_FOREGROUND_FOR.set(null);
    stopForeground(true);
    stopSelf();
    DibayCallPushLog.info(
        "foreground_service_stopped_ringing", sid, "reason=" + (reason != null ? reason : "unknown"));
    DibayCallLog.once("foreground_service_stopped", sid, "reason=" + (reason != null ? reason : "ringing_end"));
  }

  private int resolveActiveForegroundServiceType() {
    int type = android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
          == PackageManager.PERMISSION_GRANTED) {
        type |= android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
      }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
          == PackageManager.PERMISSION_GRANTED) {
        type |= android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
      }
    }
    return type;
  }

  /** API 34+ phoneCall FGS — SecurityException 시 phoneCall-only 재시도, 실패 시 false */
  private boolean promoteToForeground(String callId, Notification notification, int type) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, type);
      } else {
        startForeground(NOTIFICATION_ID, notification);
      }
      return true;
    } catch (Exception primary) {
      Log.w(TAG, "[DIBAY_CALL] foreground_service_start_failed callId=" + callId, primary);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
          && type != android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL) {
        try {
          startForeground(
              NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL);
          DibayCallLog.once(
              "foreground_service_start_degraded",
              callId,
              "reason=" + primary.getClass().getSimpleName());
          return true;
        } catch (Exception fallback) {
          Log.e(TAG, "[DIBAY_CALL] foreground_service_start_failed_fallback callId=" + callId, fallback);
        }
      }
      DibayCallLog.once(
          "foreground_service_start_failed",
          callId != null ? callId : "unknown",
          "err=" + primary.getClass().getSimpleName());
      return false;
    }
  }

  private void ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null) return;
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "통화 진행", NotificationManager.IMPORTANCE_LOW);
    channel.setDescription("활성 통화 foreground service");
    nm.createNotificationChannel(channel);
  }
}
