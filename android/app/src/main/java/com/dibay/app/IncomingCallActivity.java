package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import android.view.animation.Animation;
import android.view.animation.AnimationUtils;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;

/** Lock / background incoming — compact top pill (same structure as in-app Web banner). */
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
  private LinearLayout pill;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    applyWakeFlags();
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    setContentView(R.layout.activity_incoming_call);

    pill = findViewById(R.id.incoming_call_pill);
    LinearLayout pillWrap = findViewById(R.id.incoming_call_pill_wrap);
    IncomingCallUiInsets.applyTopSafeArea(pillWrap, 8);
    applyTabletStableWidth();
    playPillEnterAnimation();

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

    TextView callerView = findViewById(R.id.incoming_call_caller_name);
    TextView kindView = findViewById(R.id.incoming_call_kind);
    TextView initialView = findViewById(R.id.incoming_call_avatar_initial);
    ImageView avatarView = findViewById(R.id.incoming_call_avatar);
    ImageButton acceptBtn = findViewById(R.id.incoming_call_accept);
    ImageButton declineBtn = findViewById(R.id.incoming_call_decline);

    callerView.setText(displayName);
    kindView.setText(IncomingCallUiCopy.statusBrandLabel(this, callType, title, body));
    IncomingCallAvatarHelper.styleInitial(initialView);
    IncomingCallAvatarHelper.bind(avatarView, initialView, avatarUrl, displayName);

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
            IncomingCallActivity.super.finish();
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
    boolean tablet =
        (getResources().getConfiguration().screenLayout & Configuration.SCREENLAYOUT_SIZE_MASK)
            >= Configuration.SCREENLAYOUT_SIZE_LARGE;
    if (tablet) {
      pill.getLayoutParams().height =
          getResources().getDimensionPixelSize(R.dimen.dibay_incoming_pill_height_tablet);
    }
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
