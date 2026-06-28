package com.dibay.app.nativevoice;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.dibay.app.R;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;
import java.lang.ref.WeakReference;
import java.util.Locale;

/** Native-only voice call UI. Never hosts WebView. Render-only over NativeVoiceCallRuntime state. */
public class NativeVoiceCallActivity extends Activity {
  public static final String EXTRA_CALL_ID = "callId";
  public static final String EXTRA_UI_MODE = "uiMode";
  public static final String UI_MODE_INCOMING = "incoming";
  public static final String UI_MODE_OUTGOING = "outgoing";

  private static WeakReference<NativeVoiceCallActivity> activeRef = new WeakReference<>(null);

  private String callId;
  private String uiMode = UI_MODE_INCOMING;
  private TextView peerNameView;
  private TextView statusView;
  private TextView durationView;
  private TextView avatarInitialView;
  private LinearLayout incomingActions;
  private LinearLayout activeActions;
  private LinearLayout connectedControls;
  private ImageButton acceptButton;
  private ImageButton declineButton;
  private Button endButton;
  private Button speakerButton;
  private View dockRoot;
  private boolean speakerEnabled;
  private boolean dockMode = false;
  private NativeVoiceCallRuntime.State currentState = NativeVoiceCallRuntime.State.RINGING;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private long connectedAtElapsedMs = 0L;
  private final Runnable durationTick =
      new Runnable() {
        @Override
        public void run() {
          updateDurationLabel();
          mainHandler.postDelayed(this, 1000L);
        }
      };

  public static void renderState(String callId, NativeVoiceCallRuntime.State state) {
    NativeVoiceCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    activity.runOnUiThread(() -> activity.applyState(state));
  }

  public static void finishIfActive(String callId) {
    NativeVoiceCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    activity.runOnUiThread(activity::finish);
  }

  public static boolean isShowing(String callId) {
    NativeVoiceCallActivity activity = activeRef.get();
    return activity != null && callId != null && callId.equals(activity.callId);
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (!bindIntent(getIntent())) {
      finish();
      return;
    }
    if (!claimVisibleSurface()) {
      finish();
      return;
    }
    activeRef = new WeakReference<>(this);
    if (UI_MODE_INCOMING.equals(uiMode)) {
      applyIncomingWakeFlags();
    } else {
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    setContentView(R.layout.activity_native_voice_call);
    bindViews();
    bindActions();
    logSurfaceShown();
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    applyState(session != null ? session.state : defaultStateForMode());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    if (!bindIntent(intent)) return;
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    applyState(session != null ? session.state : defaultStateForMode());
  }

  @Override
  protected void onDestroy() {
    stopDurationTimer();
    hideDock("destroy");
    detachDockView();
    NativeVoiceCallActivity current = activeRef.get();
    if (current == this) activeRef = new WeakReference<>(null);
    super.onDestroy();
  }

  @Override
  public void onUserLeaveHint() {
    super.onUserLeaveHint();
    minimizeConnectedCall("user_leave");
  }

  @Override
  public void onBackPressed() {
    if (minimizeConnectedCall("back")) return;
    NativeVoiceCallLog.info("native_voice_back_blocked", callId, "state=" + currentState);
  }

  private boolean bindIntent(Intent intent) {
    callId = intent != null ? intent.getStringExtra(EXTRA_CALL_ID) : null;
    if (callId == null || callId.trim().isEmpty()) return false;
    callId = callId.trim();
    String mode = intent != null ? intent.getStringExtra(EXTRA_UI_MODE) : null;
    uiMode = UI_MODE_OUTGOING.equals(mode) ? UI_MODE_OUTGOING : UI_MODE_INCOMING;
    return true;
  }

  private boolean claimVisibleSurface() {
    if (NativeCallVisibleSurfaceOwner.isClaimed(callId)) return true;
    if (UI_MODE_OUTGOING.equals(uiMode)) {
      return NativeCallVisibleSurfaceOwner.claim(callId, "voice", "dialing");
    }
    return NativeCallVisibleSurfaceOwner.claim(callId, "voice", "incoming");
  }

  private NativeVoiceCallRuntime.State defaultStateForMode() {
    return UI_MODE_OUTGOING.equals(uiMode)
        ? NativeVoiceCallRuntime.State.CONNECTING
        : NativeVoiceCallRuntime.State.RINGING;
  }

  private void logSurfaceShown() {
    if (UI_MODE_OUTGOING.equals(uiMode)) {
      NativeVoiceCallLog.info("native_dialing_surface_shown", callId);
      return;
    }
    NativeVoiceCallLog.info("incoming_activity_shown", callId);
    NativeVoiceCallLog.info("lock_screen_visible", callId);
  }

  private void applyIncomingWakeFlags() {
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

  private void bindViews() {
    peerNameView = findViewById(R.id.native_voice_call_peer_name);
    statusView = findViewById(R.id.native_voice_call_status);
    durationView = findViewById(R.id.native_voice_call_duration);
    avatarInitialView = findViewById(R.id.native_voice_call_avatar_initial);
    incomingActions = findViewById(R.id.native_voice_call_incoming_actions);
    activeActions = findViewById(R.id.native_voice_call_active_actions);
    connectedControls = findViewById(R.id.native_voice_call_connected_controls);
    acceptButton = findViewById(R.id.native_voice_call_accept);
    declineButton = findViewById(R.id.native_voice_call_decline);
    endButton = findViewById(R.id.native_voice_call_end);
    speakerButton = findViewById(R.id.native_voice_call_speaker);
    attachDockView();
  }

  private void bindActions() {
    acceptButton.setOnClickListener(v -> NativeVoiceCallRuntime.accept(this, callId));
    declineButton.setOnClickListener(v -> NativeVoiceCallRuntime.reject(this, callId));
    endButton.setOnClickListener(v -> NativeVoiceCallRuntime.end(this, callId));
    speakerButton.setOnClickListener(
        v -> {
          speakerEnabled = !speakerEnabled;
          speakerButton.setText(
              getString(speakerEnabled ? R.string.dibay_voice_speaker_on : R.string.dibay_voice_speaker_off));
          NativeVoiceCallAgoraEngine.setSpeakerEnabled(speakerEnabled);
        });
  }

  private void applyState(NativeVoiceCallRuntime.State state) {
    currentState = state;
    if (state != NativeVoiceCallRuntime.State.CONNECTED && dockMode) {
      hideDock("state_change");
    }
    if (state == NativeVoiceCallRuntime.State.ENDING
        || state == NativeVoiceCallRuntime.State.ENDED
        || state == NativeVoiceCallRuntime.State.FAILED) {
      detachDockView();
    }
    if (dockMode && state == NativeVoiceCallRuntime.State.CONNECTED) {
      applyDockPresentation();
      return;
    }
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    NativeVoiceCallUiPresenter.Model model = NativeVoiceCallUiPresenter.build(this, session, state);
    peerNameView.setText(model.peerName);
    statusView.setText(model.statusText);
    avatarInitialView.setText(model.avatarInitial);
    incomingActions.setVisibility(model.showIncomingActions ? View.VISIBLE : View.GONE);
    activeActions.setVisibility(model.showActiveActions ? View.VISIBLE : View.GONE);
    connectedControls.setVisibility(model.showConnectedControls ? View.VISIBLE : View.GONE);
    endButton.setText(model.endButtonLabel);
    speakerButton.setText(model.speakerLabel);
    if (model.showDuration) {
      if (connectedAtElapsedMs <= 0L) connectedAtElapsedMs = SystemClock.elapsedRealtime();
      durationView.setVisibility(View.VISIBLE);
      startDurationTimer();
    } else {
      stopDurationTimer();
      connectedAtElapsedMs = 0L;
      durationView.setVisibility(View.GONE);
    }
  }

  private boolean minimizeConnectedCall(String source) {
    if (!isDockEligible()) {
      NativeVoiceCallLog.info("native_voice_minimize_blocked", callId, "source=" + source + " state=" + currentState);
      return false;
    }
    showDock(source);
    boolean minimized = dockMode;
    NativeVoiceCallLog.info(
        minimized ? "native_voice_minimize_dock" : "native_voice_minimize_failed",
        callId,
        "source=" + source);
    return minimized;
  }

  private void attachDockView() {
    if (dockRoot != null) return;
    FrameLayout root = findViewById(R.id.native_voice_call_root);
    if (root == null) return;
    dockRoot = getLayoutInflater().inflate(R.layout.layout_native_call_dock, root, false);
    FrameLayout.LayoutParams params =
        new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
    params.gravity = Gravity.TOP;
    params.setMargins(dp(12), dp(12), dp(12), 0);
    dockRoot.setVisibility(View.GONE);
    root.addView(dockRoot, params);
  }

  private boolean isDockEligible() {
    return callId != null
        && !callId.isEmpty()
        && currentState == NativeVoiceCallRuntime.State.CONNECTED
        && !isFinishing();
  }

  private void showDock(String source) {
    if (!isDockEligible()) {
      NativeVoiceCallLog.info(
          "native_voice_dock_blocked", callId, "source=" + source + " state=" + currentState);
      return;
    }
    if (dockMode) return;
    dockMode = true;
    applyDockPresentation();
    NativeVoiceCallLog.info("native_voice_dock_shown", callId, "source=" + source);
  }

  private void hideDock(String source) {
    if (!dockMode) return;
    dockMode = false;
    if (dockRoot != null) dockRoot.setVisibility(View.GONE);
    NativeVoiceCallLog.info("native_voice_dock_hidden", callId, "source=" + source);
    if (currentState != null && currentState != NativeVoiceCallRuntime.State.CONNECTED) {
      return;
    }
    if (currentState != null) applyState(currentState);
  }

  private void detachDockView() {
    if (dockRoot == null) return;
    if (dockRoot.getParent() instanceof FrameLayout) {
      ((FrameLayout) dockRoot.getParent()).removeView(dockRoot);
    }
    dockRoot = null;
    dockMode = false;
  }

  private void applyDockPresentation() {
    if (!dockMode || !isDockEligible() || dockRoot == null) return;
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    String durationText =
        connectedAtElapsedMs > 0L
            ? NativeVoiceCallDockPresenter.formatDuration(connectedAtElapsedMs)
            : durationView != null ? String.valueOf(durationView.getText()) : "00:00";
    NativeVoiceCallDockPresenter.Model model =
        NativeVoiceCallDockPresenter.build(this, session, durationText);
    NativeVoiceCallDockPresenter.bind(
        dockRoot,
        model,
        v -> {
          NativeVoiceCallLog.info("native_voice_dock_resume", callId);
          hideDock("resume_button");
        },
        v -> {
          NativeVoiceCallLog.info("end_tapped", callId, "source=dock");
          NativeVoiceCallRuntime.end(NativeVoiceCallActivity.this, callId);
        });
    if (activeActions != null) activeActions.setVisibility(View.GONE);
    dockRoot.setVisibility(View.VISIBLE);
    dockRoot.bringToFront();
    dockRoot.setTranslationZ(32f);
    if (connectedAtElapsedMs <= 0L) connectedAtElapsedMs = SystemClock.elapsedRealtime();
    startDurationTimer();
  }

  private void startDurationTimer() {
    mainHandler.removeCallbacks(durationTick);
    updateDurationLabel();
    mainHandler.postDelayed(durationTick, 1000L);
  }

  private void stopDurationTimer() {
    mainHandler.removeCallbacks(durationTick);
  }

  private void updateDurationLabel() {
    if (connectedAtElapsedMs <= 0L || durationView == null) return;
    long elapsedSec = Math.max(0L, (SystemClock.elapsedRealtime() - connectedAtElapsedMs) / 1000L);
    long minutes = elapsedSec / 60L;
    long seconds = elapsedSec % 60L;
    String label = String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds);
    durationView.setText(label);
    if (dockMode && dockRoot != null) {
      NativeVoiceCallDockPresenter.updateDuration(dockRoot, label);
    }
  }

  private int dp(int value) {
    return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
  }
}
