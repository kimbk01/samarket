package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

/** Lock-screen incoming call UI — accept via web route, reject via native PATCH. */
public class IncomingCallActivity extends AppCompatActivity {
  public static final String EXTRA_CALL_ID = "callId";
  public static final String EXTRA_CALLER_NAME = "callerName";
  public static final String EXTRA_TITLE = "title";
  public static final String EXTRA_BODY = "body";
  public static final String EXTRA_CALL_TYPE = "callType";
  public static final String EXTRA_EXPIRES_AT = "expiresAt";
  public static final String EXTRA_ROOM_ID = "roomId";
  public static final String EXTRA_CALLER_ID = "callerId";
  public static final String EXTRA_CALLER_AVATAR_URL = "callerAvatarUrl";
  public static final String ACTION_ACCEPT = "com.dibay.app.action.INCOMING_CALL_ACCEPT";
  public static final String ACTION_DECLINE = "com.dibay.app.action.INCOMING_CALL_DECLINE";
  public static final String ACTION_TERMINAL = "com.dibay.app.action.INCOMING_CALL_TERMINAL";

  private static final String TAG = "DIBAY_INCOMING_CALL";
  private String callId;
  private boolean finished;
  private BroadcastReceiver terminalReceiver;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    applyWakeFlags();
    setContentView(R.layout.activity_incoming_call);

    callId = firstNonEmpty(getIntent().getStringExtra(EXTRA_CALL_ID));
    if (callId == null) {
      finishSafely();
      return;
    }

    terminalReceiver =
        new BroadcastReceiver() {
          @Override
          public void onReceive(Context context, Intent intent) {
            if (intent == null || !ACTION_TERMINAL.equals(intent.getAction())) return;
            String sid = intent.getStringExtra(EXTRA_CALL_ID);
            if (sid == null || callId == null || !sid.trim().equals(callId.trim())) return;
            Log.i(TAG, "[DIBAY_CALL] activity_finish_by_terminal callId=" + callId);
            cleanupAndFinish();
          }
        };
    IntentFilter filter = new IntentFilter(ACTION_TERMINAL);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(terminalReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    } else {
      registerReceiver(terminalReceiver, filter);
    }

    String expiresAt = firstNonEmpty(getIntent().getStringExtra(EXTRA_EXPIRES_AT));
    if (expiresAt != null) {
      java.util.HashMap<String, String> probe = new java.util.HashMap<>();
      probe.put("expiresAt", expiresAt);
      if (FcmPayloadResolver.isExpired(probe)) {
        Log.i(TAG, "[incoming-call-native] expired_ignored callId=" + callId);
        cleanupAndFinish();
        return;
      }
    }

    Log.i(TAG, "[call-ui] incoming_activity_shown callId=" + callId);
    DibayCallLog.once("incoming_activity_created", callId, "source=activity");
    DibayCallLog.once("incoming_render", callId, "source=activity");

    String callerName = firstNonEmpty(getIntent().getStringExtra(EXTRA_CALLER_NAME));
    String title = firstNonEmpty(getIntent().getStringExtra(EXTRA_TITLE));
    String body = firstNonEmpty(getIntent().getStringExtra(EXTRA_BODY));
    String callType = firstNonEmpty(getIntent().getStringExtra(EXTRA_CALL_TYPE));

    TextView titleView = findViewById(R.id.incoming_call_title);
    TextView callerView = findViewById(R.id.incoming_call_caller_name);
    TextView kindView = findViewById(R.id.incoming_call_kind);
    Button acceptBtn = findViewById(R.id.incoming_call_accept);
    Button declineBtn = findViewById(R.id.incoming_call_decline);

    titleView.setText(title != null ? title : "수신 통화");
    callerView.setText(callerName != null ? callerName : (body != null ? body : "DIBAY"));
    kindView.setText(resolveCallKindLabel(callType, title, body));

    String action = getIntent().getAction();
    if (ACTION_ACCEPT.equals(action)) {
      Log.i(TAG, "[call-ui] notification_accept_activity_open callId=" + callId);
      handleAccept();
      return;
    }
    if (ACTION_DECLINE.equals(action)) {
      handleDecline();
      return;
    }

    acceptBtn.setOnClickListener(v -> handleAccept());
    declineBtn.setOnClickListener(v -> handleDecline());
  }

  @Override
  protected void onDestroy() {
    if (terminalReceiver != null) {
      try {
        unregisterReceiver(terminalReceiver);
      } catch (Exception ignored) {
      }
      terminalReceiver = null;
    }
    super.onDestroy();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    String action = intent.getAction();
    if (ACTION_ACCEPT.equals(action)) {
      handleAccept();
    } else if (ACTION_DECLINE.equals(action)) {
      handleDecline();
    }
  }

  private void handleAccept() {
    if (finished) return;
    DibayCallLog.once("accept_click", callId, "source=activity");
    Log.i(TAG, "[call-ui] answer_clicked callId=" + callId + " source=activity");
    IncomingCallActionCoordinator.handleAccept(getApplicationContext(), callId);
    finishSafely();
  }

  private void handleDecline() {
    if (finished) return;
    DibayCallLog.once("call_end", callId, "source=activity_reject");
    Log.i(TAG, "[call-ui] reject_clicked callId=" + callId + " source=activity");
    IncomingCallActionCoordinator.handleReject(getApplicationContext(), callId);
    finishSafely();
  }

  private void cleanupNotification() {
    IncomingCallNotificationBuilder.dismissIncomingCall(this, callId);
    IncomingCallNotificationBuilder.clearActiveIncomingCallId(callId);
  }

  private void cleanupAndFinish() {
    cleanupNotification();
    finishSafely();
  }

  private void finishSafely() {
    if (finished) return;
    finished = true;
    DibayCallLog.once("activity_finish", callId);
    finish();
  }

  private void applyWakeFlags() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
    } else {
      getWindow()
          .addFlags(
              WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                  | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                  | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }

  private static String resolveCallKindLabel(String callType, String title, String body) {
    if ("video".equalsIgnoreCase(callType)) return "영상 통화";
    if ("audio".equalsIgnoreCase(callType) || "voice".equalsIgnoreCase(callType)) return "음성 통화";
    if (title != null && (title.contains("영상") || title.contains("음성"))) return title;
    if (body != null && body.contains("영상")) return "영상 통화";
    return "수신 통화";
  }

  private static String firstNonEmpty(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}
