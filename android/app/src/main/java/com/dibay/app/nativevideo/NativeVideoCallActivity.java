package com.dibay.app.nativevideo;

import android.Manifest;
import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.dibay.app.IncomingCallUiInsets;
import com.dibay.app.R;
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
  public static final String UI_MODE_CONNECTED_RESTORE = "connected_restore";

  private static WeakReference<NativeVideoCallActivity> activeRef = new WeakReference<>(null);
  private static final int REQUEST_CODE_ACCEPT_MEDIA = 0xD1C1;
  private static final long PIP_REQUEST_TIMEOUT_MS = 1_500L; // Diagnostic only; callback is the success SSOT.

  private enum PipState {
    PIP_IDLE,
    PIP_REQUESTED,
    PIP_ACTIVE
  }

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
  private ImageButton cameraFlipButton;
  private boolean cameraEnabled = true;
  private boolean inPipMode = false;
  private PipState pipState = PipState.PIP_IDLE;
  private String lastPipSource = "";
  private long lastPipRequestAt = 0L;
  private boolean dockMode = false;
  private boolean acceptStarted = false;
  private boolean acceptMediaPromptIssued = false;
  private String pendingAcceptSource;
  private boolean localPipCustomPosition = false;
  private boolean localPipDragging = false;
  private float localPipDragStartRawX = 0f;
  private float localPipDragStartRawY = 0f;
  private int localPipDragStartLeft = 0;
  private int localPipDragStartTop = 0;
  private int localPipLeft = 0;
  private int localPipTop = 0;
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
  private final Runnable requestVerificationRunnable =
      new Runnable() {
        @Override
        public void run() {
          verifyPipRequestTimeout();
        }
      };
  private OnBackInvokedCallback nativeVideoBackCallback;
  private boolean nativeVideoBackCallbackRegistered;

  public static void renderState(String callId, NativeVideoCallRuntime.State state) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    activity.runOnUiThread(() -> activity.applyState(state));
  }

  public static void attachLocalView(String callId, View view) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId) || view == null) return;
    Runnable attach =
        () -> {
          if (!callId.equals(activity.callId) || activity.isFinishing() || activity.isDestroyed()) return;
          activity.replaceView(activity.localContainer, view, true);
        };
    if (Looper.myLooper() == Looper.getMainLooper()) {
      attach.run();
    } else {
      activity.runOnUiThread(attach);
    }
  }

  static boolean hasLocalSurfaceChild(String callId) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return false;
    return activity.localContainer != null && activity.localContainer.getChildCount() > 0;
  }

  public static void attachRemoteView(String callId, View view) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId) || view == null) return;
    Runnable attach =
        () -> {
          if (!callId.equals(activity.callId) || activity.isFinishing() || activity.isDestroyed()) return;
          activity.ensureVideoRootForRemoteRender();
          activity.replaceView(activity.remoteContainer, view, false);
          NativeVideoCallLog.info("remote_surface_attached", callId);
        };
    if (Looper.myLooper() == Looper.getMainLooper()) {
      attach.run();
    } else {
      activity.runOnUiThread(attach);
    }
  }

  static boolean hasRemoteSurfaceChild(String callId) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return false;
    return activity.remoteContainer != null && activity.remoteContainer.getChildCount() > 0;
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
    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
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
    maybeReattachSurfacesAfterConnectedRestore();
    registerNativeVideoBackCallback();
  }

  @Override
  protected void onResume() {
    super.onResume();
    NativeVideoCallLog.info("native_video_pip_activity_resumed", callId, buildPipLogDetails("resume"));
  }

  @Override
  protected void onPause() {
    super.onPause();
    NativeVideoCallLog.info("native_video_pip_activity_paused", callId, buildPipLogDetails("pause"));
  }

  @Override
  protected void onStop() {
    super.onStop();
    NativeVideoCallLog.info("native_video_pip_activity_stopped", callId, buildPipLogDetails("stop"));
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    if (!bindIntent(intent)) return;
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    applyState(session != null ? session.state : defaultStateForMode());
    maybeHandleNotificationAccept(intent);
    maybeReattachSurfacesAfterConnectedRestore();
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
  public void onUserLeaveHint() {
    super.onUserLeaveHint();
    minimizeConnectedCall("user_leave");
  }

  @Override
  public void onBackPressed() {
    handleNativeVideoBack("back");
  }

  private void registerNativeVideoBackCallback() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
    if (nativeVideoBackCallbackRegistered) return;
    nativeVideoBackCallback = () -> handleNativeVideoBack("back_invoked");
    getOnBackInvokedDispatcher()
        .registerOnBackInvokedCallback(
            OnBackInvokedDispatcher.PRIORITY_DEFAULT, nativeVideoBackCallback);
    nativeVideoBackCallbackRegistered = true;
    NativeVideoCallLog.info(
        "native_video_back_callback_registered", callId, "state=" + currentState);
  }

  private void unregisterNativeVideoBackCallback() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
    if (!nativeVideoBackCallbackRegistered || nativeVideoBackCallback == null) return;
    getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(nativeVideoBackCallback);
    nativeVideoBackCallbackRegistered = false;
    nativeVideoBackCallback = null;
    NativeVideoCallLog.info(
        "native_video_back_callback_unregistered", callId, "state=" + currentState);
  }

  private void handleNativeVideoBack(String source) {
    if (minimizeConnectedCall(source)) {
      return;
    }
    NativeVideoCallLog.info(
        "native_video_back_blocked", callId, "state=" + currentState + " source=" + source);
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    if (requestCode != REQUEST_CODE_ACCEPT_MEDIA) return;
    String source = pendingAcceptSource;
    pendingAcceptSource = null;
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        || ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
      if (!ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.RECORD_AUDIO)
          && !ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.CAMERA)) {
        openAcceptAppSettings();
      }
      return;
    }
    resumeAccept(source);
  }

  @Override
  public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode);
    inPipMode = isInPictureInPictureMode;
    applyPipUiMode(isInPictureInPictureMode);
    if (isInPictureInPictureMode && isInPictureInPictureMode()) {
      clearPipRequestVerification();
      pipState = PipState.PIP_ACTIVE;
      NativeVideoCallLog.info(
          "native_video_pip_callback_entered", callId, buildPipLogDetails("callback"));
      if (lastPipSource != null && !lastPipSource.isEmpty()) {
        NativeVideoCallLog.info("native_video_minimize_pip", callId, "source=" + lastPipSource);
      }
    } else if (!isInPictureInPictureMode) {
      clearPipRequestVerification();
      pipState = PipState.PIP_IDLE;
      NativeVideoCallLog.info(
          "native_video_pip_callback_exited", callId, buildPipLogDetails("callback"));
    }
    NativeVideoCallLog.info(
        isInPictureInPictureMode ? "native_video_pip_entered" : "native_video_pip_exited",
        callId,
        buildPipLogDetails("legacy_callback"));
  }

  @Override
  protected void onDestroy() {
    NativeVideoCallLog.info("native_video_pip_activity_destroyed", callId, buildPipLogDetails("destroy"));
    unregisterNativeVideoBackCallback();
    clearPipRequestVerification();
    pipState = PipState.PIP_IDLE;
    stopDurationTimer();
    hideDock("destroy");
    detachDockView();
    NativeVideoCallActivity current = activeRef.get();
    if (current == this) activeRef = new WeakReference<>(null);
    super.onDestroy();
  }

  private boolean bindIntent(Intent intent) {
    String previousCallId = callId;
    callId = intent != null ? intent.getStringExtra(EXTRA_CALL_ID) : null;
    if (callId == null || callId.trim().isEmpty()) return false;
    callId = callId.trim();
    if (previousCallId != null && !previousCallId.equals(callId)) {
      resetLocalPipDragMemory();
      if (localContainer != null) applyLocalPreviewLayout();
    }
    String mode = intent != null ? intent.getStringExtra(EXTRA_UI_MODE) : null;
    if (UI_MODE_OUTGOING.equals(mode)) uiMode = UI_MODE_OUTGOING;
    else if (UI_MODE_CONNECTED_RESTORE.equals(mode)) uiMode = UI_MODE_CONNECTED_RESTORE;
    else uiMode = UI_MODE_INCOMING;
    return true;
  }

  private void resetLocalPipDragMemory() {
    localPipCustomPosition = false;
    localPipLeft = 0;
    localPipTop = 0;
  }

  private boolean claimVisibleSurface() {
    if (NativeCallVisibleSurfaceOwner.isClaimed(callId)) return true;
    if (UI_MODE_OUTGOING.equals(uiMode)) {
      return NativeCallVisibleSurfaceOwner.claim(callId, "video", "dialing");
    }
    if (UI_MODE_CONNECTED_RESTORE.equals(uiMode)) {
      return NativeCallVisibleSurfaceOwner.claim(callId, "video", "connected_restore");
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
    if (UI_MODE_CONNECTED_RESTORE.equals(uiMode)) {
      NativeVideoCallLog.info("native_video_restore_surface_shown", callId);
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

  private void maybeReattachSurfacesAfterConnectedRestore() {
    if (!UI_MODE_CONNECTED_RESTORE.equals(uiMode)) return;
    if (callId == null || callId.isEmpty()) return;
    if (isFinishing() || isDestroyed()) {
      logRemoteReattachSkipped("activity_destroyed");
      return;
    }
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (session == null) {
      logRemoteReattachSkipped("session_missing");
      return;
    }
    if (session.state != NativeVideoCallRuntime.State.CONNECTED) {
      logRemoteReattachSkipped("session_not_connected");
      return;
    }
    if (!callId.equals(NativeVideoCallAgoraEngine.peekOccupantCallId())) {
      logRemoteReattachSkipped("active_call_mismatch");
      return;
    }

    if (remoteContainer != null && remoteSurfaceChildCount() == 0) {
      NativeVideoCallLog.info(
          "native_video_remote_reattach_request",
          callId,
          "uid=unknown remoteUidCount=unknown remoteChildCount=0 uiMode="
              + uiMode
              + " sessionState="
              + session.state.name());
      NativeVideoCallAgoraEngine.RemoteReattachResult remoteResult =
          NativeVideoCallAgoraEngine.reattachRemoteSurfaceIfNeeded(callId);
      if (remoteResult == NativeVideoCallAgoraEngine.RemoteReattachResult.FAILED_SETUP) {
        logRemoteReattachSkipped("engine_setup_failed");
      }
    } else if (remoteContainer != null && remoteSurfaceChildCount() > 0) {
      logRemoteReattachSkipped("existing_remote_child");
    }

    if (localContainer == null) {
      logLocalReattachSkipped("local_container_missing", 0);
      return;
    }
    int localChildCount = localSurfaceChildCount();
    if (localChildCount > 0) {
      logLocalReattachSkipped("existing_local_child", localChildCount);
      return;
    }
    if (!cameraEnabled) {
      logLocalReattachSkipped("camera_disabled", localChildCount);
      return;
    }
    NativeVideoCallLog.info(
        "native_video_local_reattach_request",
        callId,
        "cameraEnabled=true localChildCount=0 uiMode="
            + uiMode
            + " sessionState="
            + session.state.name()
            + " previewRunningKnown=true");
    NativeVideoCallAgoraEngine.LocalReattachResult localResult =
        NativeVideoCallAgoraEngine.reattachLocalPreviewIfNeeded(callId, cameraEnabled);
    if (localResult == NativeVideoCallAgoraEngine.LocalReattachResult.FAILED_SETUP) {
      logLocalReattachSkipped("engine_setup_failed", localChildCount);
    }
  }

  private int localSurfaceChildCount() {
    return localContainer != null ? localContainer.getChildCount() : 0;
  }

  private void logRemoteReattachSkipped(String reason) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    String sessionState = session != null ? session.state.name() : "missing";
    NativeVideoCallLog.info(
        "native_video_remote_reattach_skipped",
        callId != null ? callId : "unknown",
        "reason="
            + reason
            + " remoteChildCount="
            + remoteSurfaceChildCount()
            + " uiMode="
            + uiMode
            + " sessionState="
            + sessionState);
  }

  private void logLocalReattachSkipped(String reason, int localChildCount) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    String sessionState = session != null ? session.state.name() : "missing";
    NativeVideoCallLog.info(
        "native_video_local_reattach_skipped",
        callId != null ? callId : "unknown",
        "reason="
            + reason
            + " cameraEnabled="
            + cameraEnabled
            + " localChildCount="
            + localChildCount
            + " uiMode="
            + uiMode
            + " sessionState="
            + sessionState
            + " previewRunningKnown=true");
  }

  private void logReattachSkipped(String reason) {
    logRemoteReattachSkipped(reason);
  }

  private void performAccept(String source) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (session == null || session.state != NativeVideoCallRuntime.State.RINGING) {
      NativeVideoCallLog.info(
          "accept_duplicate_blocked",
          callId,
          "source=" + source + " state=" + (session != null ? session.state : "missing"));
      return;
    }
    if (acceptStarted) {
      NativeVideoCallLog.info("accept_duplicate_blocked", callId, "source=" + source + " reason=in_flight");
      return;
    }
    if (pendingAcceptSource != null) {
      NativeVideoCallLog.info(
          "accept_duplicate_blocked", callId, "source=" + source + " reason=permission_prompt_pending");
      return;
    }
    if (!ensureAcceptMediaPermissions(source)) return;
    resumeAccept(source);
  }

  private void resumeAccept(String source) {
    acceptStarted = true;
    if ("notification".equals(source)) {
      NativeVideoCallLog.info("activity_notification_accept", callId);
      NativeVideoCallLog.info("state_accepting", callId);
    }
    NativeVideoCallRuntime.accept(this, callId);
  }

  private boolean ensureAcceptMediaPermissions(String source) {
    boolean audioGranted =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;
    boolean cameraGranted =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED;
    if (audioGranted && cameraGranted) return true;
    if (ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.RECORD_AUDIO)
        || ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.CAMERA)
        || !acceptMediaPromptIssued) {
      acceptMediaPromptIssued = true;
      pendingAcceptSource = source;
      ActivityCompat.requestPermissions(
          this,
          audioGranted
              ? new String[] {Manifest.permission.CAMERA}
              : cameraGranted
                  ? new String[] {Manifest.permission.RECORD_AUDIO}
                  : new String[] {Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA},
          REQUEST_CODE_ACCEPT_MEDIA);
      return false;
    }
    openAcceptAppSettings();
    return false;
  }

  private void openAcceptAppSettings() {
    try {
      startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.fromParts("package", getPackageName(), null)));
    } catch (Exception ignored) {
    }
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
    attachLocalPipDragListener();
    applyLocalPreviewLayout();
    IncomingCallUiInsets.applyBottomSafeArea(incomingActions, 32);
    IncomingCallUiInsets.applyBottomSafeArea(activeActions, 32);
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
      clearPipRequestVerification();
      pipState = PipState.PIP_IDLE;
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
      ensureCameraFlipButton();
    }
    updateCameraFlipVisibility();
  }

  private boolean minimizeConnectedCall(String source) {
    if (!isDockEligible() && !isPipEligible()) {
      NativeVideoCallLog.info("native_video_minimize_blocked", callId, "source=" + source + " state=" + currentState);
      return false;
    }
    if (tryEnterPip(source)) {
      NativeVideoCallLog.info("native_video_pip_request_consumed", callId, buildPipLogDetails(source));
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
    lastPipSource = source != null ? source : "";
    NativeVideoCallLog.info("native_video_pip_request", callId, buildPipLogDetails(lastPipSource));
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      NativeVideoCallLog.info(
          "native_video_pip_request_rejected", callId, buildPipLogDetails(lastPipSource) + " reason=api_below_26");
      return false;
    }
    if (!hasSystemPipFeature()) {
      NativeVideoCallLog.info(
          "native_video_pip_request_rejected",
          callId,
          buildPipLogDetails(lastPipSource) + " reason=feature_picture_in_picture_false");
      return false;
    }
    if (inPipMode || isInPictureInPictureMode() || pipState == PipState.PIP_ACTIVE) {
      pipState = PipState.PIP_ACTIVE;
      NativeVideoCallLog.info(
          "native_video_pip_request_consumed",
          callId,
          buildPipLogDetails(lastPipSource) + " reason=already_in_pip");
      return true;
    }
    if (pipState == PipState.PIP_REQUESTED) {
      NativeVideoCallLog.info(
          "native_video_pip_request_consumed",
          callId,
          buildPipLogDetails(lastPipSource) + " reason=request_in_flight");
      return true;
    }
    if (!isPipEligible()) {
      NativeVideoCallLog.info("native_video_pip_blocked", callId, "source=" + source + " state=" + currentState);
      NativeVideoCallLog.info(
          "native_video_pip_request_rejected", callId, buildPipLogDetails(lastPipSource) + " reason=ineligible");
      return false;
    }
    PictureInPictureParams params = NativeVideoCallPipPresenter.buildParams(this, callId);
    if (params == null) {
      NativeVideoCallLog.info(
          "native_video_pip_request_rejected", callId, buildPipLogDetails(lastPipSource) + " reason=params_null");
      return false;
    }
    try {
      clearPipRequestVerification();
      boolean entered = enterPictureInPictureMode(params);
      if (entered) {
        pipState = PipState.PIP_REQUESTED;
        lastPipRequestAt = SystemClock.elapsedRealtime();
        NativeVideoCallLog.info(
            "native_video_pip_request_accepted", callId, buildPipLogDetails(lastPipSource));
        mainHandler.postDelayed(requestVerificationRunnable, PIP_REQUEST_TIMEOUT_MS);
      } else {
        pipState = PipState.PIP_IDLE;
        NativeVideoCallLog.info(
            "native_video_pip_request_rejected", callId, buildPipLogDetails(lastPipSource));
      }
      return entered;
    } catch (RuntimeException error) {
      pipState = PipState.PIP_IDLE;
      NativeVideoCallLog.warn(
          "native_video_pip_enter_failed", callId, "err=" + error.getClass().getSimpleName());
      return false;
    }
  }

  private boolean isPipEligible() {
    return callId != null && !callId.isEmpty() && currentState == NativeVideoCallRuntime.State.CONNECTED;
  }

  private void verifyPipRequestTimeout() {
    if (pipState != PipState.PIP_REQUESTED) return;
    boolean actualPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isInPictureInPictureMode();
    if (actualPip) return;
    NativeVideoCallLog.info("native_video_pip_request_timeout", callId, buildPipLogDetails("timeout"));
    pipState = PipState.PIP_IDLE;
  }

  private void clearPipRequestVerification() {
    mainHandler.removeCallbacks(requestVerificationRunnable);
  }

  private boolean hasSystemPipFeature() {
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
  }

  private boolean isRemoteSurfaceAttached() {
    if (remoteContainer == null || remoteContainer.getChildCount() <= 0) return false;
    View child = remoteContainer.getChildAt(0);
    return child != null && child.isAttachedToWindow();
  }

  private int remoteSurfaceChildCount() {
    return remoteContainer != null ? remoteContainer.getChildCount() : 0;
  }

  private String buildPipLogDetails(String source) {
    long elapsedMs =
        lastPipRequestAt > 0L ? Math.max(0L, SystemClock.elapsedRealtime() - lastPipRequestAt) : -1L;
    boolean actualPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isInPictureInPictureMode();
    return "source="
        + (source != null && !source.isEmpty() ? source : "unknown")
        + " state="
        + currentState
        + " pipState="
        + pipState.name()
        + " isInPictureInPictureMode="
        + actualPip
        + " isFinishing="
        + isFinishing()
        + " isDestroyed="
        + isDestroyed()
        + " dockMode="
        + dockMode
        + " remoteChildCount="
        + remoteSurfaceChildCount()
        + " remote_surface_attached="
        + isRemoteSurfaceAttached()
        + " lastPipSource="
        + (lastPipSource != null && !lastPipSource.isEmpty() ? lastPipSource : "none")
        + " elapsedMs="
        + elapsedMs;
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

  private void ensureCameraFlipButton() {
    if (cameraFlipButton != null || connectedControls == null) return;
    cameraFlipButton = new ImageButton(this);
    cameraFlipButton.setImageResource(android.R.drawable.ic_menu_rotate);
    cameraFlipButton.setColorFilter(Color.WHITE);
    cameraFlipButton.setContentDescription("camera_flip");
    cameraFlipButton.setBackgroundResource(R.drawable.bg_dibay_incoming_btn_accept);
    cameraFlipButton.setPadding(dp(12), dp(12), dp(12), dp(12));
    cameraFlipButton.setScaleType(android.widget.ImageView.ScaleType.CENTER_INSIDE);
    cameraFlipButton.setVisibility(View.GONE);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(48), dp(48));
    params.setMarginEnd(dp(12));
    int cameraIndex = connectedControls.indexOfChild(cameraButton);
    connectedControls.addView(
        cameraFlipButton, cameraIndex >= 0 ? cameraIndex : connectedControls.getChildCount(), params);
    cameraFlipButton.setOnClickListener(
        v -> {
          NativeVideoCallAgoraEngine.switchCameraFacing();
          updateCameraFlipVisibility();
        });
  }

  private void updateCameraFlipVisibility() {
    if (cameraFlipButton == null) return;
    boolean visible =
        currentState == NativeVideoCallRuntime.State.CONNECTED && !inPipMode && !dockMode;
    cameraFlipButton.setVisibility(visible ? View.VISIBLE : View.GONE);
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
    updateCameraFlipVisibility();
    applyDockPresentation();
    NativeVideoCallLog.info("native_video_dock_shown", callId, "source=" + source);
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

  private void replaceView(FrameLayout container, View view, boolean mediaOverlay) {
    if (container == null || view == null) return;
    if (view.getParent() instanceof FrameLayout) {
      ((FrameLayout) view.getParent()).removeView(view);
    }
    container.removeAllViews();
    if (view instanceof SurfaceView) {
      ((SurfaceView) view).setZOrderMediaOverlay(mediaOverlay);
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

  private void attachLocalPipDragListener() {
    if (localContainer == null) return;
    localContainer.setOnTouchListener(
        (view, event) -> {
          if (!isLocalPipDragEligible()) return false;
          switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
              localPipDragging = true;
              localPipDragStartRawX = event.getRawX();
              localPipDragStartRawY = event.getRawY();
              localPipDragStartLeft = view.getLeft();
              localPipDragStartTop = view.getTop();
              int[] start = clampLocalPipPosition(localPipDragStartLeft, localPipDragStartTop);
              localPipLeft = start[0];
              localPipTop = start[1];
              localPipCustomPosition = true;
              applyLocalPipPosition(false);
              return true;
            case MotionEvent.ACTION_MOVE:
              if (!localPipDragging) return false;
              int left = localPipDragStartLeft + Math.round(event.getRawX() - localPipDragStartRawX);
              int top = localPipDragStartTop + Math.round(event.getRawY() - localPipDragStartRawY);
              int[] clamped = clampLocalPipPosition(left, top);
              localPipLeft = clamped[0];
              localPipTop = clamped[1];
              applyLocalPipPosition(true);
              return true;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
              localPipDragging = false;
              return true;
            default:
              return false;
          }
        });
  }

  private boolean isLocalPipDragEligible() {
    return currentState == NativeVideoCallRuntime.State.CONNECTED && !inPipMode && !dockMode;
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
    if (localPipCustomPosition) {
      int[] clamped = clampLocalPipPosition(localPipLeft, localPipTop);
      localPipLeft = clamped[0];
      localPipTop = clamped[1];
      applyLocalPipPosition(false);
      return;
    }
    localContainer.setLayoutParams(createLocalPreviewLayoutParams());
  }

  private void applyLocalPipPosition(boolean logDrag) {
    if (localContainer == null) return;
    FrameLayout.LayoutParams current = (FrameLayout.LayoutParams) localContainer.getLayoutParams();
    FrameLayout.LayoutParams params =
        new FrameLayout.LayoutParams(current.width, current.height);
    params.gravity = Gravity.TOP | Gravity.START;
    params.setMargins(localPipLeft, localPipTop, 0, 0);
    localContainer.setLayoutParams(params);
    if (logDrag) {
      NativeVideoCallLog.info(
          "native_video_local_pip_drag", callId, "left=" + localPipLeft + " top=" + localPipTop);
    }
  }

  private int[] clampLocalPipPosition(int left, int top) {
    if (localContainer == null || !(localContainer.getParent() instanceof View)) {
      return new int[] {Math.max(0, left), Math.max(0, top)};
    }
    View parent = (View) localContainer.getParent();
    int maxLeft = Math.max(0, parent.getWidth() - localContainer.getWidth());
    int maxTop = Math.max(0, parent.getHeight() - localContainer.getHeight());
    return new int[] {Math.max(0, Math.min(left, maxLeft)), Math.max(0, Math.min(top, maxTop))};
  }

  private FrameLayout.LayoutParams createLocalPreviewLayoutParams() {
    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(dp(120), dp(213));
    params.gravity = Gravity.TOP | Gravity.END;
    params.setMargins(0, dp(88), dp(20), 0);
    return params;
  }

  private int dp(int value) {
    return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
  }
}
