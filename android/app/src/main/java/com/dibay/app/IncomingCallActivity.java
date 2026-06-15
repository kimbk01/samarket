package com.dibay.app;

import android.content.Intent;
import android.net.Uri;
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
  public static final String ACTION_ACCEPT = "com.dibay.app.action.INCOMING_CALL_ACCEPT";
  public static final String ACTION_DECLINE = "com.dibay.app.action.INCOMING_CALL_DECLINE";

  private static final String TAG = "DIBAY_INCOMING_CALL";
  private String callId;
  private boolean finished;

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

    Log.i(TAG, "[incoming-call-native] activity_opened callId=" + callId);

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
    if (!IncomingCallActionCoordinator.tryBegin(callId, "accept")) {
      finishSafely();
      return;
    }
    Log.i(TAG, "[incoming-call-native] answer_clicked callId=" + callId);
    cleanupNotification();
    Intent launch = new Intent(this, MainActivity.class);
    launch.setAction(Intent.ACTION_VIEW);
    launch.setData(Uri.parse("dibay://call/" + Uri.encode(callId) + "?action=accept"));
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    startActivity(launch);
    IncomingCallActionCoordinator.end(callId, "accept");
    finishSafely();
  }

  private void handleDecline() {
    if (finished) return;
    if (!IncomingCallActionCoordinator.tryBegin(callId, "reject")) {
      finishSafely();
      return;
    }
    Log.i(TAG, "[incoming-call-native] decline_clicked callId=" + callId);
    Log.i(TAG, "[call-flow] cleanup_start callId=" + callId);
    cleanupNotification();
    new Thread(() -> {
      CallSessionPatchHelper.patch(getApplicationContext(), callId, "reject");
      runOnUiThread(
          () -> {
            IncomingCallActionCoordinator.end(callId, "reject");
            Log.i(TAG, "[call-flow] cleanup_done callId=" + callId);
            finishSafely();
          });
    }).start();
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
