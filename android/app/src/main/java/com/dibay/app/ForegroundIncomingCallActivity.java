package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.Animation;
import android.view.animation.AnimationUtils;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;

/** In-app foreground incoming pill — primary surface when app is unlocked and visible. */
public class ForegroundIncomingCallActivity extends AppCompatActivity {
  private static final String TAG = "DIBAY_INCOMING_CALL";

  private String callId;
  private boolean finished;
  private BroadcastReceiver terminalReceiver;
  private LinearLayout pill;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    applyOverlayWindowFlags();
    setContentView(R.layout.activity_foreground_incoming_call);

    pill = findViewById(R.id.foreground_incoming_pill);
    LinearLayout pillWrap = findViewById(R.id.foreground_incoming_pill_wrap);
    IncomingCallUiInsets.applyTopSafeArea(pillWrap, 8);
    applyTabletStableWidth();
    playPillEnterAnimation();

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

    bindIncomingUi(getIntent());

    String action = getIntent().getAction();
    if (IncomingCallActivity.ACTION_ACCEPT.equals(action)) {
      handleAccept();
      return;
    }
    if (IncomingCallActivity.ACTION_DECLINE.equals(action)) {
      handleDecline();
      return;
    }
  }

  private void bindIncomingUi(Intent intent) {
    String callerName = firstNonEmpty(intent.getStringExtra(IncomingCallActivity.EXTRA_CALLER_NAME));
    String title = firstNonEmpty(intent.getStringExtra(IncomingCallActivity.EXTRA_TITLE));
    String body = firstNonEmpty(intent.getStringExtra(IncomingCallActivity.EXTRA_BODY));
    String callType = firstNonEmpty(intent.getStringExtra(IncomingCallActivity.EXTRA_CALL_TYPE));
    String avatarUrl = firstNonEmpty(intent.getStringExtra(IncomingCallActivity.EXTRA_CALLER_AVATAR_URL));

    String displayName = IncomingCallUiCopy.callerDisplayName(callerName, title, body);

    TextView kindView = findViewById(R.id.foreground_incoming_kind);
    TextView callerView = findViewById(R.id.foreground_incoming_caller_name);
    TextView initialView = findViewById(R.id.foreground_incoming_avatar_initial);
    ImageView avatarView = findViewById(R.id.foreground_incoming_avatar);
    ImageButton acceptBtn = findViewById(R.id.foreground_incoming_accept);
    ImageButton declineBtn = findViewById(R.id.foreground_incoming_decline);

    kindView.setText(IncomingCallUiCopy.statusBrandLabel(this, callType, title, body));
    callerView.setText(displayName);
    IncomingCallAvatarHelper.styleInitial(initialView);
    IncomingCallAvatarHelper.bind(avatarView, initialView, avatarUrl, displayName);

    acceptBtn.setOnClickListener(v -> handleAccept());
    declineBtn.setOnClickListener(v -> handleDecline());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    String incomingCallId = firstNonEmpty(intent.getStringExtra(IncomingCallActivity.EXTRA_CALL_ID));
    if (incomingCallId != null) {
      callId = incomingCallId;
      ForegroundIncomingCallRegistry.setActive(callId);
      MainActivity.notifyForegroundIncomingUiState(callId, true);
      bindIncomingUi(intent);
      playPillEnterAnimation();
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
    if (pill == null) {
      finish();
      overridePendingTransition(0, 0);
      return;
    }
    Animation exit = AnimationUtils.loadAnimation(this, R.anim.dibay_incoming_pill_exit);
    exit.setAnimationListener(
        new Animation.AnimationListener() {
          @Override
          public void onAnimationStart(Animation animation) {}

          @Override
          public void onAnimationEnd(Animation animation) {
            ForegroundIncomingCallActivity.super.finish();
            overridePendingTransition(0, 0);
          }

          @Override
          public void onAnimationRepeat(Animation animation) {}
        });
    pill.startAnimation(exit);
  }

  private void playPillEnterAnimation() {
    if (pill == null) return;
    pill.clearAnimation();
    Animation enter = AnimationUtils.loadAnimation(this, R.anim.dibay_incoming_pill_enter);
    pill.startAnimation(enter);
  }

  private void applyTabletStableWidth() {
    if (pill == null) return;
    boolean tablet = (getResources().getConfiguration().screenLayout & Configuration.SCREENLAYOUT_SIZE_MASK)
        >= Configuration.SCREENLAYOUT_SIZE_LARGE;
    if (tablet) {
      pill.getLayoutParams().height =
          getResources().getDimensionPixelSize(R.dimen.dibay_incoming_pill_height_tablet);
    }
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

  private static String firstNonEmpty(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}
