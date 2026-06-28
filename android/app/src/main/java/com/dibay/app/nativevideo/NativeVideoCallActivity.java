package com.dibay.app.nativevideo;

import android.app.Activity;
import android.app.PictureInPictureParams;
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
import com.dibay.app.call.ScreenAwakeBridge;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;
import java.lang.ref.WeakReference;
import java.util.Locale;

/** Native-only video call UI. Never hosts WebView. Render-only over NativeVideoCallRuntime state. */
public class NativeVideoCallActivity extends Activity {
  public static final String EXTRA_CALL_ID = "callId";
  public static final String EXTRA_UI_MODE = "uiMode";
  public static final String EXTRA_SHOW_DOCK = "showDock";
  public static final String EXTRA_NOTIFICATION_ACCEPT = "notificationAccept";
  public static final String ACTION_NOTIFICATION_ACCEPT = "com.dibay.app.nativevideo.NOTIFICATION_ACCEPT";
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
  private View dockRoot;
  private ImageButton dockMinimizeButton;
  private boolean cameraEnabled = true;
  private boolean inPipMode = false;
  private boolean dockMode = false;
  private boolean acceptStarted = false;
  private NativeVideoCallRuntime.State currentState = NativeVideoCallRuntime.State.RINGING;
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

  public String getBoundCallId() {
    return callId != null ? callId : "";
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
    }
    setContentView(R.layout.activity_native_video_call);
    bindViews();
    bindActions();
    logSurfaceShown();
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    applyState(session != null ? session.state : defaultStateForMode());
    maybeHandleNotificationAccept(getIntent());
  }

  @Override
  protected void onResume() {
    super.onResume();
    notifyConnectedVideoScreenAwake("native_video_resume");
  }

  @Override
  protected void onPause() {
    super.onPause();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    if (!bindIntent(intent)) return;
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    applyState(session != null ? session.state : defaultStateForMode());
    maybeHandleNotificationAccept(intent);
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    if (callId == null || callId.isEmpty()) return;
    NativeVideoCallLog.info("video_activity_config_changed", callId, "orientation=" + newConfig.orientation);
    applyLocalPreviewLayout();
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (session != null) applyState(session.state);
    notifyConnectedVideoScreenAwake("rotation");
  }

  @Override
  public void onUserLeaveHint() {
    super.onUserLeaveHint();
    minimizeConnectedCall("user_leave");
  }

  @Override
  public void onBackPressed() {
    if (minimizeConnectedCall("back")) return;
    NativeVideoCallLog.info("native_video_back_blocked", callId, "state=" + currentState);
  }

  @Override
  public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode);
    inPipMode = isInPictureInPictureMode;
    applyPipUiMode(isInPictureInPictureMode);
    NativeVideoCallLog.info(
        isInPictureInPictureMode ? "native_video_pip_entered" : "native_video_pip_exited", callId);
    notifyConnectedVideoScreenAwake(isInPictureInPictureMode ? "pip" : "pip_exit");
  }

  @Override
  protected void onDestroy() {
    stopDurationTimer();
    hideDock("destroy");
    detachDockView();
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

  private boolean isNotificationAcceptIntent(Intent intent) {
    if (intent == null) return false;
    return intent.getBooleanExtra(EXTRA_NOTIFICATION_ACCEPT, false)
        || ACTION_NOTIFICATION_ACCEPT.equals(intent.getAction());
  }

  private void maybeHandleNotificationAccept(Intent intent) {
    if (!isNotificationAcceptIntent(intent) || !UI_MODE_INCOMING.equals(uiMode)) return;
    performAccept("notification");
  }

  private void performAccept(String source) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (session == null || session.state != NativeVideoCallRuntime.State.RINGING) {
      NativeVideoCallLog.info(
          "accept_duplicate_blocked", callId, "source=" + source + " state=" + (session != null ? session.state : "missing"));
      return;
    }
    if (acceptStarted) {
      NativeVideoCallLog.info("accept_duplicate_blocked", callId, "source=" + source + " reason=in_flight");
      return;
    }
    acceptStarted = true;
    if ("notification".equals(source)) {
      NativeVideoCallLog.info("activity_notification_accept", callId);
      NativeVideoCallLog.info("state_accepting", callId);
    }
    NativeVideoCallRuntime.accept(this, callId);
  }

  private void applyIncomingWakeFlags() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
    } else {
      getWindow()
          .addFlags(
              WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                  | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
    }
    getWindow()
        .addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
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
    attachDockView();
    applyLocalPreviewLayout();
  }

  private void bindActions() {
    acceptButton.setOnClickListener(v -> performAccept("button"));
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
    currentState = state;
    if (state != NativeVideoCallRuntime.State.CONNECTED && dockMode) {
      hideDock("state_change");
    }
    if (state == NativeVideoCallRuntime.State.ENDING
        || state == NativeVideoCallRuntime.State.ENDED
        || state == NativeVideoCallRuntime.State.FAILED) {
      detachDockView();
    }
    if (dockMode && state == NativeVideoCallRuntime.State.CONNECTED) {
      applyDockPresentation();
      return;
    }
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
    if (inPipMode) applyPipUiMode(true);
    if (model.showConnectedControls) {
      ensureDockMinimizeButton();
    }
  }

  private boolean minimizeConnectedCall(String source) {
    if (!isDockEligible() && !isPipEligible()) {
      NativeVideoCallLog.info("native_video_minimize_blocked", callId, "source=" + source + " state=" + currentState);
      return false;
    }
    if (tryEnterPip(source)) {
      NativeVideoCallLog.info("native_video_minimize_pip", callId, "source=" + source);
      return true;
    }
    showDock(source + "_pip_fallback");
    boolean minimized = dockMode;
    NativeVideoCallLog.info(
        minimized ? "native_video_minimize_dock" : "native_video_minimize_failed",
        callId,
        "source=" + source);
    return minimized;
  }

  private boolean tryEnterPip(String source) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
    if (inPipMode || isInPictureInPictureMode()) return true;
    if (!isPipEligible()) {
      NativeVideoCallLog.info("native_video_pip_blocked", callId, "source=" + source + " state=" + currentState);
      return false;
    }
    PictureInPictureParams params = NativeVideoCallPipPresenter.buildParams(this, callId);
    if (params == null) return false;
    try {
      boolean entered = enterPictureInPictureMode(params);
      NativeVideoCallLog.info(
          entered ? "native_video_pip_enter_requested" : "native_video_pip_enter_rejected",
          callId,
          "source=" + source);
      return entered;
    } catch (RuntimeException error) {
      NativeVideoCallLog.warn(
          "native_video_pip_enter_failed", callId, "err=" + error.getClass().getSimpleName());
      return false;
    }
  }

  private boolean isPipEligible() {
    return callId != null && !callId.isEmpty() && currentState == NativeVideoCallRuntime.State.CONNECTED;
  }

  private void applyPipUiMode(boolean enabled) {
    if (enabled && dockMode) hideDock("pip_enter");
    if (overlayRoot != null) overlayRoot.setVisibility(enabled ? View.GONE : View.VISIBLE);
    if (activeActions != null) activeActions.setVisibility(enabled ? View.GONE : View.VISIBLE);
    if (localContainer != null) localContainer.setVisibility(enabled ? View.GONE : View.VISIBLE);
    if (dockRoot != null) dockRoot.setVisibility(enabled || !dockMode ? View.GONE : View.VISIBLE);
    if (!enabled && currentState != null) {
      applyState(currentState);
    }
  }

  private void attachDockView() {
    if (dockRoot != null || videoRoot == null) return;
    FrameLayout root = findViewById(R.id.native_video_call_root);
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

  private void ensureDockMinimizeButton() {
    if (dockMinimizeButton != null || connectedControls == null) return;
    dockMinimizeButton = new ImageButton(this);
    dockMinimizeButton.setImageResource(android.R.drawable.ic_menu_agenda);
    dockMinimizeButton.setContentDescription("dock_minimize");
    dockMinimizeButton.setBackgroundResource(R.drawable.bg_dibay_incoming_btn_accept);
    dockMinimizeButton.setPadding(dp(12), dp(12), dp(12), dp(12));
    dockMinimizeButton.setScaleType(android.widget.ImageView.ScaleType.CENTER_INSIDE);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(48), dp(48));
    params.setMarginEnd(dp(12));
    connectedControls.addView(dockMinimizeButton, 0, params);
    dockMinimizeButton.setOnClickListener(v -> showDock("minimize_button"));
  }

  private boolean isDockEligible() {
    return callId != null
        && !callId.isEmpty()
        && currentState == NativeVideoCallRuntime.State.CONNECTED
        && !inPipMode
        && !isFinishing();
  }

  private void showDock(String source) {
    if (!isDockEligible()) {
      NativeVideoCallLog.info(
          "native_video_dock_blocked", callId, "source=" + source + " state=" + currentState);
      return;
    }
    if (dockMode) return;
    dockMode = true;
    applyDockPresentation();
    NativeVideoCallLog.info("native_video_dock_shown", callId, "source=" + source);
    notifyConnectedVideoScreenAwake("native_dock");
  }

  private void hideDock(String source) {
    if (!dockMode) return;
    dockMode = false;
    if (dockRoot != null) dockRoot.setVisibility(View.GONE);
    NativeVideoCallLog.info("native_video_dock_hidden", callId, "source=" + source);
    if (currentState != null && currentState != NativeVideoCallRuntime.State.CONNECTED) {
      return;
    }
    if (currentState != null) applyState(currentState);
    notifyConnectedVideoScreenAwake("native_dock_exit");
  }

  private void notifyConnectedVideoScreenAwake(String presentation) {
    if (callId == null || callId.isEmpty()) return;
    if (currentState != NativeVideoCallRuntime.State.CONNECTED) return;
    ScreenAwakeBridge.notifyPresentationChanged(callId, presentation);
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
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    String durationText =
        connectedAtElapsedMs > 0L
            ? NativeVideoCallDockPresenter.formatDuration(connectedAtElapsedMs)
            : durationView != null ? String.valueOf(durationView.getText()) : "00:00";
    NativeVideoCallDockPresenter.Model model =
        NativeVideoCallDockPresenter.build(this, session, durationText);
    NativeVideoCallDockPresenter.bind(
        dockRoot,
        model,
        v -> {
          NativeVideoCallLog.info("native_video_dock_resume", callId);
          hideDock("resume_button");
        },
        v -> {
          NativeVideoCallLog.info("end_tapped", callId, "source=dock");
          NativeVideoCallRuntime.end(NativeVideoCallActivity.this, callId);
        });
    if (videoRoot != null) videoRoot.setVisibility(View.GONE);
    if (overlayRoot != null) overlayRoot.setVisibility(View.GONE);
    if (activeActions != null) activeActions.setVisibility(View.GONE);
    dockRoot.setVisibility(View.VISIBLE);
    dockRoot.bringToFront();
    dockRoot.setTranslationZ(32f);
    if (connectedAtElapsedMs <= 0L) connectedAtElapsedMs = SystemClock.elapsedRealtime();
    startDurationTimer();
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
    String label = String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds);
    durationView.setText(label);
    if (dockMode && dockRoot != null) {
      NativeVideoCallDockPresenter.updateDuration(dockRoot, label);
    }
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
