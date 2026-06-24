package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import com.dibay.app.callv4.CallV4Lane;
import java.util.concurrent.ConcurrentHashMap;

/** Lock-screen incoming call UI — accept/reject via web call-route (V3 PATCH owner). */
public class IncomingCallActivity extends AppCompatActivity {
  private static final ConcurrentHashMap<String, Long> VISIBLE_CALL_IDS = new ConcurrentHashMap<>();
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

  static boolean isCallVisible(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    Long shownAt = VISIBLE_CALL_IDS.get(callId.trim());
    return shownAt != null && System.currentTimeMillis() - shownAt < 60_000L;
  }

  private String callId;
  private boolean finished;
  private boolean nativeSurfaceHiddenEmitted;
  private BroadcastReceiver terminalReceiver;

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
    VISIBLE_CALL_IDS.put(callId.trim(), System.currentTimeMillis());
    IncomingCallBackgroundNotifier.cancelLaunchVisibilityVerify(callId);
    if (CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] incoming_activity_shown callId=" + callId);
      IncomingCallSurfaceOwner.SurfaceOwner owner =
          DibayKeyguardHelper.isKeyguardLocked(getApplicationContext())
              ? IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI
              : IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY;
      IncomingCallSurfaceOwner.transitionIncomingOwner(
          getApplicationContext(), callId, owner, "incoming_activity_visible");
    }
    DibayCallLog.once("incoming_activity_created", callId, "source=activity");
    DibayCallLog.once("incoming_render", callId, "source=activity");

    bindIncomingUi(getIntent());
    notifyNativeSurfaceVisible();

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

    acceptBtn.setOnClickListener(
        v -> {
          if (CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) {
            Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] accept_button_perform_click callId=" + callId);
          }
          handleAccept();
        });
    acceptBtn.setOnTouchListener(
        (v, event) -> {
          if (!CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) return false;
          int action = event.getActionMasked();
          if (action == MotionEvent.ACTION_DOWN) {
            Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] accept_button_touch_down callId=" + callId);
          } else if (action == MotionEvent.ACTION_UP) {
            Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] accept_button_touch_up callId=" + callId);
          }
          return false;
        });
    declineBtn.setOnClickListener(v -> handleDecline());

    acceptBtn.post(() -> traceAcceptButtonState(acceptBtn));
  }

  private void traceAcceptButtonState(ImageButton acceptBtn) {
    if (acceptBtn == null || callId == null) return;
    if (!CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) return;
    Rect rect = new Rect();
    acceptBtn.getGlobalVisibleRect(rect);
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] accept_button_rendered callId=" + callId);
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] accept_button_bounds callId="
            + callId
            + " left="
            + rect.left
            + " top="
            + rect.top
            + " right="
            + rect.right
            + " bottom="
            + rect.bottom);
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] accept_button_enabled callId="
            + callId
            + " enabled="
            + acceptBtn.isEnabled()
            + " clickable="
            + acceptBtn.isClickable()
            + " visible="
            + (acceptBtn.getVisibility() == View.VISIBLE));
  }

  @Override
  protected void onResume() {
    super.onResume();
    nativeSurfaceHiddenEmitted = false;
    notifyNativeSurfaceVisible();
  }

  @Override
  protected void onStop() {
    notifyNativeSurfaceHidden("hidden");
    super.onStop();
  }

  @Override
  protected void onDestroy() {
    if (callId != null && !callId.trim().isEmpty()) {
      VISIBLE_CALL_IDS.remove(callId.trim());
    }
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
    String nextCallId = firstNonEmpty(intent.getStringExtra(EXTRA_CALL_ID));
    if (nextCallId != null && !nextCallId.equals(callId)) {
      callId = nextCallId;
      finished = false;
      bindIncomingUi(intent);
      notifyNativeSurfaceVisible();
    }
    String action = intent.getAction();
    if (ACTION_ACCEPT.equals(action)) {
      handleAccept();
    } else if (ACTION_DECLINE.equals(action)) {
      handleDecline();
    }
  }

  private void notifyNativeSurfaceVisible() {
    if (callId == null || callId.trim().isEmpty()) return;
    if (!CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) return;
    MainActivity.deliverCallV4NativeIncomingSurface(
        this, callId, true, "incoming_activity_visible");
  }

  private void notifyNativeSurfaceHidden(String reason) {
    if (callId == null || callId.trim().isEmpty()) return;
    if (!CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) return;
    if (nativeSurfaceHiddenEmitted) return;
    nativeSurfaceHiddenEmitted = true;
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] incoming_activity_hidden callId=" + callId + " reason=" + reason);
    MainActivity.deliverCallV4NativeIncomingSurface(
        this, callId, false, "incoming_activity_" + reason);
  }

  private void handleAccept() {
    if (finished) return;
    if (CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] fsi_accept_tap callId=" + callId);
    }
    DibayCallLog.once("accept_click", callId, "source=activity");
    Log.i(TAG, "[call-ui] answer_clicked callId=" + callId + " source=activity");
    IncomingCallActionCoordinator.handleAccept(getApplicationContext(), callId);
    if (CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) {
      finishSafely();
      return;
    }
    showConnectingState();
  }

  private void showConnectingState() {
    LinearLayout actions = findViewById(R.id.incoming_call_actions);
    TextView kindView = findViewById(R.id.incoming_call_kind);
    if (actions != null) {
      actions.setVisibility(View.GONE);
    }
    if (kindView != null) {
      kindView.setText(getString(R.string.incoming_call_connecting));
    }
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
    notifyNativeSurfaceHidden("destroyed");
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

  private static String firstNonEmpty(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}
