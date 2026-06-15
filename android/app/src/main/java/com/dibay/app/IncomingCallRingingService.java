package com.dibay.app;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.Nullable;

/** Foreground service while an incoming call notification is active (lock-screen wake reliability). */
public class IncomingCallRingingService extends Service {
  private static final String TAG = "DIBAY_INCOMING_CALL";
  private static final String EXTRA_NOTIFICATION_ID = "notificationId";

  public static void start(Context context, int notificationId) {
    Intent intent = new Intent(context, IncomingCallRingingService.class);
    intent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent);
      } else {
        context.startService(intent);
      }
    } catch (Exception error) {
      Log.w(TAG, "[incoming-call-native] ringing_service_start_failed " + error.getMessage());
    }
  }

  public static void stop(Context context) {
    try {
      context.stopService(new Intent(context, IncomingCallRingingService.class));
    } catch (Exception error) {
      Log.w(TAG, "[incoming-call-native] ringing_service_stop_failed " + error.getMessage());
    }
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    int notificationId =
        intent != null
            ? intent.getIntExtra(EXTRA_NOTIFICATION_ID, IncomingCallNotificationBuilder.INCOMING_CALL_NOTIFICATION_BASE_ID)
            : IncomingCallNotificationBuilder.INCOMING_CALL_NOTIFICATION_BASE_ID;
    Notification notification = IncomingCallNotificationBuilder.consumeForegroundNotification();
    if (notification == null) {
      Log.w(TAG, "[incoming-call-native] ringing_service_no_notification");
      stopSelf();
      return START_NOT_STICKY;
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(notificationId, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL);
      } else {
        startForeground(notificationId, notification);
      }
      Log.i(TAG, "[incoming-call-native] ringing_service_started notificationId=" + notificationId);
    } catch (Exception error) {
      Log.w(TAG, "[incoming-call-native] ringing_service_foreground_failed " + error.getMessage());
      stopSelf();
      return START_NOT_STICKY;
    }
    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(Service.STOP_FOREGROUND_REMOVE);
      } else {
        stopForeground(true);
      }
    } catch (Exception error) {
      Log.w(TAG, "[incoming-call-native] ringing_service_stop_foreground_failed " + error.getMessage());
    }
    IncomingCallNotificationBuilder.clearForegroundNotification();
    super.onDestroy();
  }

  @Nullable
  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
