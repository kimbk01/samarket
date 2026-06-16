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
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

/** In-app foreground incoming pill — primary surface when app is unlocked and visible. */
public class ForegroundIncomingCallActivity extends AppCompatActivity {
  private static final String TAG = "DIBAY_INCOMING_CALL";

  private String callId;
  private boolean finished;
  private BroadcastReceiver terminalReceiver;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    applyOverlayWindowFlags();
    setContentView(R.layout.activity_foreground_incoming_call);
    applySafeAreaInsets();

    callId = firstNonEmpty(getIntent().getStringExtra(IncomingCallActivity.EXTRA_CALL_ID));
    if (callId == null) {
      finishSafely();
      return;
    }

    terminalReceiver =
        new BroadcastReceiver() {
          @Override
          public void onReceive(Context context, Intent intent) {
            if (intent == null || !IncomingCallActivity.ACTION_TERMINAL.equals(intent.getAction())) return;
            String sid = intent.getStringExtra(IncomingCallActivity.EXTRA_CALL_ID);
            if (sid == null || callId == null || !sid.trim().equals(callId.trim())) return;
            Log.i(TAG, "[DIBAY_CALL] foreground_activity_finish_by_terminal callId=" + callId);
            cleanupAndFinish();
          }
        };
    IntentFilter filter = new IntentFilter(IncomingCallActivity.ACTION_TERMINAL);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(terminalReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    } else {
      registerReceiver(terminalReceiver, filter);
    }

    String expiresAt = firstNonEmpty(getIntent().getStringExtra(IncomingCallActivity.EXTRA_EXPIRES_AT));
    if (expiresAt != null) {
      java.util.HashMap<String, String> probe = new java.util.HashMap<>();
      probe.put("expiresAt", expiresAt);
      if (FcmPayloadResolver.isExpired(probe)) {
        Log.i(TAG, "[incoming-call-native] foreground_expired_ignored callId=" + callId);
        cleanupAndFinish();
        return;
      }
    }

    if (DibayCallConsumedStore.isConsumed(this, callId)) {
      Log.i(TAG, "[DIBAY_CALL] foreground_incoming_skipped_consumed callId=" + callId);
      cleanupAndFinish();
      return;
    }

    Log.i(TAG, "[call-ui] foreground_incoming_activity_shown callId=" + callId);
    DibayCallLog.once("incoming_activity_created", callId, "source=foreground_activity");
    ForegroundIncomingCallRegistry.setActive(callId);
    MainActivity.notifyForegroundIncomingUiState(callId, true);

    String callerName = firstNonEmpty(getIntent().getStringExtra(IncomingCallActivity.EXTRA_CALLER_NAME));
    String title = firstNonEmpty(getIntent().getStringExtra(IncomingCallActivity.EXTRA_TITLE));
    String body = firstNonEmpty(getIntent().getStringExtra(IncomingCallActivity.EXTRA_BODY));
    String callType = firstNonEmpty(getIntent().getStringExtra(IncomingCallActivity.EXTRA_CALL_TYPE));

    TextView kindView = findViewById(R.id.foreground_incoming_kind);
    TextView callerView = findViewById(R.id.foreground_incoming_caller_name);
    Button acceptBtn = findViewById(R.id.foreground_incoming_accept);
    Button declineBtn = findViewById(R.id.foreground_incoming_decline);

    kindView.setText(resolveCallKindLabel(callType, title, body));
    callerView.setText(callerName != null ? callerName : (body != null ? body : "DIBAY"));

    String action = getIntent().getAction();
    if (IncomingCallActivity.ACTION_ACCEPT.equals(action)) {
      handleAccept();
      return;
    }
    if (IncomingCallActivity.ACTION_DECLINE.equals(action)) {
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
    String incomingCallId = firstNonEmpty(intent.getStringExtra(IncomingCallActivity.EXTRA_CALL_ID));
    if (incomingCallId != null && callId != null && !incomingCallId.equals(callId)) {
      callId = incomingCallId;
      ForegroundIncomingCallRegistry.setActive(callId);
      MainActivity.notifyForegroundIncomingUiState(callId, true);
      TextView callerView = findViewById(R.id.foreground_incoming_caller_name);
      String callerName = firstNonEmpty(intent.getStringExtra(IncomingCallActivity.EXTRA_CALLER_NAME));
      String body = firstNonEmpty(intent.getStringExtra(IncomingCallActivity.EXTRA_BODY));
      callerView.setText(callerName != null ? callerName : (body != null ? body : "DIBAY"));
    }
    String action = intent.getAction();
    if (IncomingCallActivity.ACTION_ACCEPT.equals(action)) {
      handleAccept();
    } else if (IncomingCallActivity.ACTION_DECLINE.equals(action)) {
      handleDecline();
    }
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
    if (callId != null) {
      ForegroundIncomingCallRegistry.clear(callId);
      MainActivity.notifyForegroundIncomingUiState(callId, false);
    }
    super.onDestroy();
  }

  private void handleAccept() {
    if (finished) return;
    DibayCallLog.once("accept_click", callId, "source=foreground_activity");
    Log.i(TAG, "[call-ui] answer_clicked callId=" + callId + " source=foreground_activity");
    IncomingCallActionCoordinator.handleAccept(getApplicationContext(), callId);
    finishSafely();
  }

  private void handleDecline() {
    if (finished) return;
    DibayCallLog.once("call_end", callId, "source=foreground_activity_reject");
    Log.i(TAG, "[call-ui] reject_clicked callId=" + callId + " source=foreground_activity");
    IncomingCallActionCoordinator.handleReject(getApplicationContext(), callId);
    finishSafely();
  }

  private void cleanupAndFinish() {
    IncomingCallNotificationBuilder.dismissIncomingCall(this, callId);
    finishSafely();
  }

  private void finishSafely() {
    if (finished) return;
    finished = true;
    DibayCallLog.once("activity_finish", callId);
    finish();
    overridePendingTransition(0, 0);
  }

  private void applyOverlayWindowFlags() {
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow()
        .addFlags(
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(false);
      setTurnScreenOn(false);
    }
  }

  private void applySafeAreaInsets() {
    LinearLayout pill = findViewById(R.id.foreground_incoming_pill);
    ViewCompat.setOnApplyWindowInsetsListener(
        pill,
        (view, insets) -> {
          Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
          view.setPadding(
              view.getPaddingLeft(),
              bars.top + dpToPx(8),
              view.getPaddingRight(),
              view.getPaddingBottom());
          return insets;
        });
    ViewCompat.requestApplyInsets(pill);
  }

  private int dpToPx(int dp) {
    return Math.round(dp * getResources().getDisplayMetrics().density);
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
