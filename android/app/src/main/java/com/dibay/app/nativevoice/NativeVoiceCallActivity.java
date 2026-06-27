package com.dibay.app.nativevoice;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
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
  private boolean speakerEnabled;
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
    NativeVoiceCallActivity current = activeRef.get();
    if (current == this) activeRef = new WeakReference<>(null);
    super.onDestroy();
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
    durationView.setText(String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds));
  }
}
