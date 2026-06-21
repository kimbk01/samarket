package com.dibay.app;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;

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
  private static final long FULLSCREEN_PRESS_MS = 150L;
  private String callId;
  private boolean finished;
  private BroadcastReceiver terminalReceiver;
  private AnimatorSet[] pulseAnimators;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    applyWakeFlags();
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    setContentView(R.layout.activity_incoming_call);

    LinearLayout center = findViewById(R.id.incoming_call_center);
    LinearLayout actions = findViewById(R.id.incoming_call_actions);
    IncomingCallUiInsets.applyTopSafeArea(center, 24);
    IncomingCallUiInsets.applyBottomSafeArea(actions, 16);
    startPulseAnimation();

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
    MainActivity.notifyLockIncomingUiState(callId, true);

    bindIncomingUi(getIntent());

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
  }

  private void bindIncomingUi(Intent intent) {
    String callerName = firstNonEmpty(intent.getStringExtra(EXTRA_CALLER_NAME));
    String title = firstNonEmpty(intent.getStringExtra(EXTRA_TITLE));
    String body = firstNonEmpty(intent.getStringExtra(EXTRA_BODY));
    String callType = firstNonEmpty(intent.getStringExtra(EXTRA_CALL_TYPE));
    String avatarUrl = firstNonEmpty(intent.getStringExtra(EXTRA_CALLER_AVATAR_URL));

    String displayName = IncomingCallUiCopy.callerDisplayName(callerName, title, body);

    TextView titleView = findViewById(R.id.incoming_call_title);
    TextView callerView = findViewById(R.id.incoming_call_caller_name);
    TextView kindView = findViewById(R.id.incoming_call_kind);
    TextView initialView = findViewById(R.id.incoming_call_avatar_initial);
    ImageView avatarView = findViewById(R.id.incoming_call_avatar);
    ImageButton acceptBtn = findViewById(R.id.incoming_call_accept);
    ImageButton declineBtn = findViewById(R.id.incoming_call_decline);

    titleView.setVisibility(View.GONE);
    callerView.setText(displayName);
    kindView.setText(IncomingCallUiCopy.statusBrandLabel(this, callType, title, body));
    IncomingCallAvatarHelper.styleInitial(initialView);
    IncomingCallAvatarHelper.bind(avatarView, initialView, avatarUrl, displayName);

    acceptBtn.setOnClickListener(null);
    declineBtn.setOnClickListener(null);
    bindPressReleaseButton(acceptBtn, this::handleAccept);
    bindPressReleaseButton(declineBtn, this::handleDecline);
  }

  private void bindPressReleaseButton(ImageButton btn, Runnable action) {
    final long[] pressStartedAt = {0L};
    final boolean[] tracking = {false};
    btn.setOnTouchListener(
        (v, event) -> {
          switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
              tracking[0] = true;
              pressStartedAt[0] = System.currentTimeMillis();
              v.setScaleX(0.92f);
              v.setScaleY(0.92f);
              v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
              return true;
            case MotionEvent.ACTION_MOVE:
              if (!tracking[0]) return true;
              float mx = event.getX();
              float my = event.getY();
              if (mx < 0 || my < 0 || mx > v.getWidth() || my > v.getHeight()) {
                tracking[0] = false;
                v.setScaleX(1f);
                v.setScaleY(1f);
              }
              return true;
            case MotionEvent.ACTION_UP:
              if (!tracking[0]) return true;
              tracking[0] = false;
              v.setScaleX(1f);
              v.setScaleY(1f);
              long elapsed = System.currentTimeMillis() - pressStartedAt[0];
              float ux = event.getX();
              float uy = event.getY();
              boolean inside = ux >= 0 && uy >= 0 && ux <= v.getWidth() && uy <= v.getHeight();
              if (elapsed >= FULLSCREEN_PRESS_MS && inside) {
                action.run();
              }
              return true;
            case MotionEvent.ACTION_CANCEL:
              tracking[0] = false;
              v.setScaleX(1f);
              v.setScaleY(1f);
              return true;
            default:
              return false;
          }
        });
  }

  @Override
  protected void onDestroy() {
    stopPulseAnimation();
    if (terminalReceiver != null) {
      try {
        unregisterReceiver(terminalReceiver);
      } catch (Exception ignored) {
      }
      terminalReceiver = null;
    }
    super.onDestroy();
  }

  private void startPulseAnimation() {
    View ringOne = findViewById(R.id.incoming_call_pulse_ring_one);
    View ringTwo = findViewById(R.id.incoming_call_pulse_ring_two);
    View ringThree = findViewById(R.id.incoming_call_pulse_ring_three);
    pulseAnimators =
        new AnimatorSet[] {
          buildPulseAnimator(ringOne, 0),
          buildPulseAnimator(ringTwo, 160),
          buildPulseAnimator(ringThree, 320)
        };
    for (AnimatorSet animator : pulseAnimators) {
      if (animator != null) animator.start();
    }
  }

  private void stopPulseAnimation() {
    if (pulseAnimators == null) return;
    for (AnimatorSet animator : pulseAnimators) {
      if (animator != null) animator.cancel();
    }
    pulseAnimators = null;
  }

  private AnimatorSet buildPulseAnimator(View ring, long delayMs) {
    if (ring == null) return null;
    ring.setAlpha(0.8f);
    ObjectAnimator scaleX = ObjectAnimator.ofFloat(ring, View.SCALE_X, 1f, 1.25f);
    ObjectAnimator scaleY = ObjectAnimator.ofFloat(ring, View.SCALE_Y, 1f, 1.25f);
    ObjectAnimator alpha = ObjectAnimator.ofFloat(ring, View.ALPHA, 0.8f, 0f);
    for (ObjectAnimator animator : new ObjectAnimator[] {scaleX, scaleY, alpha}) {
      animator.setDuration(1000);
      animator.setStartDelay(delayMs);
      animator.setRepeatCount(ValueAnimator.INFINITE);
      animator.setRepeatMode(ValueAnimator.RESTART);
    }
    AnimatorSet set = new AnimatorSet();
    set.playTogether(scaleX, scaleY, alpha);
    return set;
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
    if (callId != null) {
      MainActivity.notifyLockIncomingUiState(callId, false);
    }
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

  private static String firstNonEmpty(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}
