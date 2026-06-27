package com.dibay.app.nativevideo;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.SurfaceView;
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

/** Native-only video call UI. Never hosts WebView. Render-only over NativeVideoCallRuntime state. */
public class NativeVideoCallActivity extends Activity {
  public static final String EXTRA_CALL_ID = "callId";
  public static final String EXTRA_UI_MODE = "uiMode";
  public static final String UI_MODE_INCOMING = "incoming";
  public static final String UI_MODE_OUTGOING = "outgoing";

  private static WeakReference<NativeVideoCallActivity> activeRef = new WeakReference<>(null);

  private String callId;
  private String uiMode = UI_MODE_INCOMING;
  private FrameLayout videoRoot;
  private FrameLayout remoteContainer;
  private FrameLayout localContainer;
  private LinearLayout overlayRoot;
  private LinearLayout statusPanel;
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
  private Button cameraButton;
  private boolean cameraEnabled = true;
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

  public static void renderState(String callId, NativeVideoCallRuntime.State state) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    activity.runOnUiThread(() -> activity.applyState(state));
  }

  public static void attachLocalView(String callId, View view) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId) || view == null) return;
    activity.runOnUiThread(() -> activity.replaceView(activity.localContainer, view));
  }

  public static void attachRemoteView(String callId, View view) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId) || view == null) return;
    activity.runOnUiThread(
        () -> {
          activity.ensureVideoRootForRemoteRender();
          activity.replaceView(activity.remoteContainer, view);
          NativeVideoCallLog.info("remote_surface_attached", callId);
        });
  }

  public static boolean ensureVideoRootForRemoteRender(String callId) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return false;
    if (Looper.myLooper() != Looper.getMainLooper()) return false;
    return activity.ensureVideoRootForRemoteRender();
  }

  public static void finishIfActive(String callId) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    activity.runOnUiThread(activity::finish);
  }

  public static void clearVideoSurfaces(String callId) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    Runnable clear =
        () -> {
          if (activity.localContainer != null) activity.localContainer.removeAllViews();
          if (activity.remoteContainer != null) activity.remoteContainer.removeAllViews();
        };
    if (Looper.myLooper() == Looper.getMainLooper()) clear.run();
    else activity.runOnUiThread(clear);
  }

  public static boolean isShowing(String callId) {
    NativeVideoCallActivity activity = activeRef.get();
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
    setContentView(R.layout.activity_native_video_call);
    bindViews();
    bindActions();
    logSurfaceShown();
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    applyState(session != null ? session.state : defaultStateForMode());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    if (!bindIntent(intent)) return;
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    applyState(session != null ? session.state : defaultStateForMode());
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    if (callId == null || callId.isEmpty()) return;
    NativeVideoCallLog.info("video_activity_config_changed", callId, "orientation=" + newConfig.orientation);
    applyLocalPreviewLayout();
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (session != null) applyState(session.state);
  }

  @Override
  protected void onDestroy() {
    stopDurationTimer();
    NativeVideoCallActivity current = activeRef.get();
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
      return NativeCallVisibleSurfaceOwner.claim(callId, "video", "dialing");
    }
    return NativeCallVisibleSurfaceOwner.claim(callId, "video", "incoming");
  }

  private NativeVideoCallRuntime.State defaultStateForMode() {
    return UI_MODE_OUTGOING.equals(uiMode)
        ? NativeVideoCallRuntime.State.CONNECTING
        : NativeVideoCallRuntime.State.RINGING;
  }

  private void logSurfaceShown() {
    if (UI_MODE_OUTGOING.equals(uiMode)) {
      NativeVideoCallLog.info("native_dialing_surface_shown", callId);
      return;
    }
    NativeVideoCallLog.info("incoming_activity_shown", callId);
    NativeVideoCallLog.info("lock_screen_visible", callId);
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
    videoRoot = findViewById(R.id.native_video_call_video_root);
    remoteContainer = findViewById(R.id.native_video_call_remote);
    localContainer = findViewById(R.id.native_video_call_local);
    overlayRoot = findViewById(R.id.native_video_call_overlay);
    statusPanel = findViewById(R.id.native_video_call_status_panel);
    peerNameView = findViewById(R.id.native_video_call_peer_name);
    statusView = findViewById(R.id.native_video_call_status);
    durationView = findViewById(R.id.native_video_call_duration);
    avatarInitialView = findViewById(R.id.native_video_call_avatar_initial);
    incomingActions = findViewById(R.id.native_video_call_incoming_actions);
    activeActions = findViewById(R.id.native_video_call_active_actions);
    connectedControls = findViewById(R.id.native_video_call_connected_controls);
    acceptButton = findViewById(R.id.native_video_call_accept);
    declineButton = findViewById(R.id.native_video_call_decline);
    endButton = findViewById(R.id.native_video_call_end);
    cameraButton = findViewById(R.id.native_video_call_camera);
    applyLocalPreviewLayout();
  }

  private void bindActions() {
    acceptButton.setOnClickListener(v -> NativeVideoCallRuntime.accept(this, callId));
    declineButton.setOnClickListener(v -> NativeVideoCallRuntime.reject(this, callId));
    endButton.setOnClickListener(v -> NativeVideoCallRuntime.end(this, callId));
    cameraButton.setOnClickListener(
        v -> {
          cameraEnabled = !cameraEnabled;
          cameraButton.setText(
              getString(cameraEnabled ? R.string.dibay_video_camera_on : R.string.dibay_video_camera_off));
          NativeVideoCallAgoraEngine.setCameraEnabled(cameraEnabled);
        });
  }

  private void applyState(NativeVideoCallRuntime.State state) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    NativeVideoCallUiPresenter.Model model = NativeVideoCallUiPresenter.build(this, session, state);
    peerNameView.setText(model.peerName);
    statusView.setText(model.statusText);
    avatarInitialView.setText(model.avatarInitial);
    incomingActions.setVisibility(model.showIncomingActions ? View.VISIBLE : View.GONE);
    activeActions.setVisibility(model.showActiveActions ? View.VISIBLE : View.GONE);
    connectedControls.setVisibility(model.showConnectedControls ? View.VISIBLE : View.GONE);
    endButton.setText(model.endButtonLabel);
    cameraButton.setText(model.cameraLabel);
    videoRoot.setVisibility(model.showVideoSurfaces ? View.VISIBLE : View.GONE);
    localContainer.setVisibility(model.showLocalPreview ? View.VISIBLE : View.GONE);
    statusPanel.setVisibility(model.showStatusOverlay ? View.VISIBLE : View.GONE);
    if (model.showVideoSurfaces) {
      overlayRoot.setBackgroundColor(Color.TRANSPARENT);
      peerNameView.setTextColor(Color.WHITE);
      statusView.setTextColor(Color.LTGRAY);
    } else {
      overlayRoot.setBackgroundResource(R.drawable.bg_dibay_incoming_fullscreen);
      peerNameView.setTextColor(getResources().getColor(R.color.dibay_incoming_text_primary, getTheme()));
      statusView.setTextColor(getResources().getColor(R.color.dibay_incoming_text_muted, getTheme()));
    }
    if (model.showDuration) {
      if (connectedAtElapsedMs <= 0L) connectedAtElapsedMs = SystemClock.elapsedRealtime();
      durationView.setVisibility(View.VISIBLE);
      startDurationTimer();
    } else {
      stopDurationTimer();
      connectedAtElapsedMs = 0L;
      durationView.setVisibility(View.GONE);
    }
    if (model.showVideoSurfaces) {
      activeActions.bringToFront();
      activeActions.setTranslationZ(24f);
      ensureVideoRootForRemoteRender();
      NativeVideoCallAgoraEngine.onRemoteRenderSurfaceReady(callId);
    }
  }

  private boolean ensureVideoRootForRemoteRender() {
    if (videoRoot == null || remoteContainer == null) return false;
    videoRoot.setVisibility(View.VISIBLE);
    remoteContainer.setVisibility(View.VISIBLE);
    return true;
  }

  private void replaceView(FrameLayout container, View view) {
    if (container == null || view == null) return;
    if (view.getParent() instanceof FrameLayout) {
      ((FrameLayout) view.getParent()).removeView(view);
    }
    container.removeAllViews();
    if (view instanceof SurfaceView) {
      ((SurfaceView) view).setZOrderMediaOverlay(true);
    }
    container.addView(
        view,
        new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
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

  private void applyLocalPreviewLayout() {
    if (localContainer == null) return;
    localContainer.setLayoutParams(createLocalPreviewLayoutParams());
  }

  private FrameLayout.LayoutParams createLocalPreviewLayoutParams() {
    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(dp(120), dp(180));
    params.gravity = Gravity.TOP | Gravity.END;
    params.setMargins(0, dp(88), dp(20), 0);
    return params;
  }

  private int dp(int value) {
    return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
  }
}
