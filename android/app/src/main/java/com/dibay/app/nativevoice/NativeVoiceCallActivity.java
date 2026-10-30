package com.dibay.app.nativevoice;

import android.Manifest;
import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
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
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.dibay.app.IncomingCallUiCopy;
import com.dibay.app.IncomingCallUiInsets;
import com.dibay.app.R;
import com.dibay.app.call.NativeCallAppReturn;
import com.dibay.app.nativecall.NativeCallInAppNoticeOverlay;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;
import java.lang.ref.WeakReference;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/** Native-only voice call UI. Never hosts WebView. Render-only over NativeVoiceCallRuntime state. */
public class NativeVoiceCallActivity extends Activity {
  public static final String EXTRA_CALL_ID = "callId";
  public static final String EXTRA_UI_MODE = "uiMode";
  public static final String EXTRA_NOTIFICATION_ACCEPT = "notificationAccept";
  /** CUT-5C — local attempt id while PREPARING (no server session yet). */
  public static final String EXTRA_ATTEMPT_ID = "attemptId";
  public static final String EXTRA_PREPARING = "preparing";
  public static final String EXTRA_PEER_NAME = "peerName";
  public static final String ACTION_NOTIFICATION_ACCEPT = "com.dibay.app.nativevoice.NOTIFICATION_ACCEPT";
  public static final String UI_MODE_INCOMING = "incoming";
  public static final String UI_MODE_OUTGOING = "outgoing";

  private static WeakReference<NativeVoiceCallActivity> activeRef = new WeakReference<>(null);
  /** S2 — 화면이 다시 만들어져도(PiP 닫은 뒤 복귀) 통화 시간이 이어지도록 callId 별 연결 시각. UI 전용. */
  private static final ConcurrentHashMap<String, Long> CONNECTED_AT_BY_CALL = new ConcurrentHashMap<>();
  private static final long APP_RETURN_AFTER_PIP_FALLBACK_MS = 800L;
  private static final int REQUEST_CODE_ACCEPT_MEDIA = 0xD1C0;

  private String callId;
  private String attemptId;
  private String preparingPeerName;
  private boolean preparing;
  private String uiMode = UI_MODE_INCOMING;
  private OnBackInvokedCallback nativeVoiceBackCallback;
  private boolean nativeVoiceBackCallbackRegistered;
  private TextView peerNameView;
  private TextView statusView;
  private TextView durationView;
  private TextView avatarInitialView;
  private LinearLayout incomingActions;
  private LinearLayout mediaActions;
  private ImageButton acceptButton;
  private ImageButton declineButton;
  private ImageButton speakerButton;
  private ImageButton videoButton;
  private ImageButton muteButton;
  private ImageButton endButton;
  private TextView muteLabel;
  private View dockRoot;
  private View topBar;
  private ImageButton minimizeButton;
  /** S2 P2 — 통화 화면 PiP 상태 (UI 전용). */
  private boolean inPipMode = false;
  /** S2 P3 — PiP 상태에서 화면이 멈춤(onStop) = 사용자가 PiP 창을 닫았거나 화면 꺼짐. 이때 파괴돼도 통화 유지. */
  private boolean stoppedInPip = false;
  /** PiP 진입 후 앱(메신저)을 앞으로 가져올 요청 출처 — null 이면 앱 복귀 안 함(홈 버튼 등). */
  private String pendingAppReturnSource;
  private boolean speakerEnabled;
  private boolean micMutedChrome;
  private boolean videoActiveChrome;
  private boolean micChromeEnabled;
  private boolean dockMode = false;
  private boolean acceptStarted = false;
  private boolean acceptMediaPromptIssued = false;
  private String pendingAcceptSource;
  /** WP-3 NEW-11: accept source parked while the user is in app Settings granting the mic. */
  private String pendingSettingsAcceptSource;
  private NativeVoiceCallRuntime.State currentState = NativeVoiceCallRuntime.State.RINGING;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private long connectedAtElapsedMs = 0L;
  private NativeCallInAppNoticeOverlay noticeOverlay;
  private boolean finishingWithNotice;
  private final Runnable appReturnAfterPipFallback =
      new Runnable() {
        @Override
        public void run() {
          if (pendingAppReturnSource == null) return;
          String source = pendingAppReturnSource;
          pendingAppReturnSource = null;
          NativeVoiceCallLog.info("native_voice_app_return_after_pip_timeout", callId, "source=" + source);
          NativeCallAppReturn.bringAppToFront(NativeVoiceCallActivity.this, callId, source);
        }
      };
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
    finishIfActive(callId, null);
  }

  public static void finishIfActive(String callId, String reason) {
    if (callId != null) CONNECTED_AT_BY_CALL.remove(callId.trim());
    NativeVoiceCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    // END UX: terminal surface exit must not wait for in-app notice duration.
    activity.runOnUiThread(
        () -> {
          if (activity.isFinishing()) return;
          activity.finish();
        });
  }

  public static boolean isShowing(String callId) {
    NativeVoiceCallActivity activity = activeRef.get();
    return activity != null && callId != null && callId.equals(activity.callId);
  }

  public static boolean isShowingPreparing(String attemptId) {
    NativeVoiceCallActivity activity = activeRef.get();
    return activity != null
        && activity.preparing
        && attemptId != null
        && attemptId.equals(activity.attemptId);
  }

  /** CUT-5C — remap PREPARING Activity onto real session callId without recreate. */
  public static boolean bindToCallId(String attemptId, String callId) {
    NativeVoiceCallActivity activity = activeRef.get();
    if (activity == null || !activity.preparing) return false;
    if (attemptId == null || callId == null) return false;
    String aid = attemptId.trim();
    String sid = callId.trim();
    if (aid.isEmpty() || sid.isEmpty()) return false;
    if (!aid.equals(activity.attemptId)) return false;
    activity.preparing = false;
    activity.callId = sid;
    activity.runOnUiThread(
        () -> {
          NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(sid);
          if (session != null) {
            activity.applyState(session.state);
          } else {
            activity.applyState(NativeVoiceCallRuntime.State.CONNECTING);
          }
        });
    return true;
  }

  public static void finishIfPreparing(String attemptId) {
    NativeVoiceCallActivity activity = activeRef.get();
    if (activity == null || attemptId == null) return;
    String aid = attemptId.trim();
    if (aid.isEmpty()) return;
    if (activity.attemptId == null || !aid.equals(activity.attemptId)) return;
    if (!activity.preparing) {
      // Already bound or finishing — only finish if still the preparing surface key.
      return;
    }
    activity.runOnUiThread(
        () -> {
          if (!activity.isFinishing()) activity.finish();
        });
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (!bindIntent(getIntent())) {
      finish();
      return;
    }
    if (UI_MODE_INCOMING.equals(uiMode)
        && !com.dibay.app.DibayCallAuthEligibilityStore.isMemberCallEligible(this)) {
      NativeVoiceCallLog.warn(
          "incoming_activity_blocked_guest_ineligible",
          callId,
          "reason=member_call_not_eligible");
      finish();
      return;
    }
    if (!preparing && NativeVoiceCallRuntime.getSession(callId) == null) {
      NativeVoiceCallLog.info("stale_activity_finish", callId, "reason=no_session");
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
    noticeOverlay = NativeCallInAppNoticeOverlay.attach(this);
    bindActions();
    logSurfaceShown();
    if (preparing) {
      applyPreparingPresentation();
    } else {
      NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
      applyState(session != null ? session.state : defaultStateForMode());
    }
    maybeHandleNotificationAccept(getIntent());
    registerNativeVoiceBackCallback();
  }

  private void finishWithNotice(String reason) {
    if (isFinishing()) return;
    if (finishingWithNotice) return;
    NativeCallInAppNoticeOverlay.Event event = NativeCallInAppNoticeOverlay.mapTerminalReason(reason);
    if (event == null || noticeOverlay == null) {
      finish();
      return;
    }
    finishingWithNotice = true;
    noticeOverlay.showThen(event, this::finish);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    if (!bindIntent(intent)) return;
    if (preparing) {
      applyPreparingPresentation();
      return;
    }
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    if (session == null) {
      NativeVoiceCallLog.info("stale_activity_finish", callId, "reason=no_session");
      finish();
      return;
    }
    // Resuming via any route other than the in-dock "return" button (e.g. tapping back into
    // the task from Recents/launcher) must not leave the Activity stuck rendering the mini
    // dock — force full-screen restore so media controls (speaker/mute/video/end) reappear.
    if (dockMode) {
      hideDock("new_intent_resume");
    }
    applyState(session.state);
    maybeHandleNotificationAccept(intent);
  }

  @Override
  protected void onDestroy() {
    stopDurationTimer();
    hideDock("destroy");
    detachDockView();
    unregisterNativeVoiceBackCallback();
    NativeVoiceCallActivity current = activeRef.get();
    if (current == this) activeRef = new WeakReference<>(null);
    // Proven zombie path: OEM/system can finish this separate-task Activity without end().
    // If session is still live after surface destroy, terminate so FGS/audio cannot linger.
    // cleanup() removes session before finishIfActive → getSession null → no double-end.
    mainHandler.removeCallbacks(appReturnAfterPipFallback);
    if (preparing && attemptId != null && !attemptId.isEmpty()) {
      NativeVoiceCallRuntime.abandonPreparingFromUi(
          getApplicationContext(), attemptId, "activity_destroyed");
    } else if (stoppedInPip && isLiveConnectedSession()) {
      // S2 P3 (Owner 2026-10-30): PiP 창을 닫아도 통화는 종료 버튼·상대 종료로만 끝난다.
      // 통화는 Runtime·FGS 가 유지하고, 진행 중 통화 알림·앱 통화 바로 화면을 다시 연다.
      NativeVoiceCallLog.info("native_voice_pip_dismissed_call_kept", callId, "state=" + currentState);
    } else {
      endLiveSessionIfSurfaceDestroyed();
    }
    super.onDestroy();
  }

  @Override
  protected void onResume() {
    super.onResume();
    // WP-3 NEW-11: user returned from app Settings — resume accept if the mic is now granted and
    // the call is still ringing.
    String parked = pendingSettingsAcceptSource;
    if (parked == null) return;
    pendingSettingsAcceptSource = null;
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED) {
      return;
    }
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    if (session == null || session.state != NativeVoiceCallRuntime.State.RINGING) return;
    NativeVoiceCallLog.info("accept_resumed_after_settings", callId, "source=" + parked);
    resumeAccept(parked);
  }

  @Override
  protected void onStart() {
    super.onStart();
    stoppedInPip = false;
  }

  @Override
  protected void onStop() {
    super.onStop();
    if (inPipMode || isInPictureInPictureMode()) {
      stoppedInPip = true;
      NativeVoiceCallLog.info("native_voice_pip_activity_stopped", callId, "state=" + currentState);
    }
  }

  @Override
  public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode);
    inPipMode = isInPictureInPictureMode;
    applyPipUiMode(isInPictureInPictureMode);
    NativeVoiceCallLog.info(
        isInPictureInPictureMode ? "native_voice_pip_entered" : "native_voice_pip_exited", callId);
    if (isInPictureInPictureMode && pendingAppReturnSource != null) {
      mainHandler.removeCallbacks(appReturnAfterPipFallback);
      String source = pendingAppReturnSource;
      pendingAppReturnSource = null;
      NativeCallAppReturn.bringAppToFront(this, callId, source);
    }
  }

  @Override
  public void onUserLeaveHint() {
    super.onUserLeaveHint();
    minimizeConnectedCall("user_leave");
  }

  @Override
  public void onBackPressed() {
    handleNativeVoiceBack("back");
  }

  private void registerNativeVoiceBackCallback() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
    if (nativeVoiceBackCallbackRegistered) return;
    nativeVoiceBackCallback = () -> handleNativeVoiceBack("back_invoked");
    getOnBackInvokedDispatcher()
        .registerOnBackInvokedCallback(
            OnBackInvokedDispatcher.PRIORITY_DEFAULT, nativeVoiceBackCallback);
    nativeVoiceBackCallbackRegistered = true;
    NativeVoiceCallLog.info(
        "native_voice_back_callback_registered", callId, "state=" + currentState);
  }

  private void unregisterNativeVoiceBackCallback() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
    if (!nativeVoiceBackCallbackRegistered || nativeVoiceBackCallback == null) return;
    getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(nativeVoiceBackCallback);
    nativeVoiceBackCallbackRegistered = false;
    nativeVoiceBackCallback = null;
  }

  private void handleNativeVoiceBack(String source) {
    if (preparing && attemptId != null && !attemptId.isEmpty()) {
      NativeVoiceCallRuntime.abandonPreparingFromUi(
          getApplicationContext(), attemptId, "back:" + source);
      return;
    }
    if (minimizeToApp(source)) return;
    if (leavePreConnectedCallToApp(source)) return;
    NativeVoiceCallLog.info(
        "native_voice_back_blocked", callId, "state=" + currentState + " source=" + source);
  }

  /**
   * S2 P1 (Owner 2026-10-30): 연결 전(벨·연결 중) 뒤로는 취소·거절이 아니다. 화면만 내리고 앱으로 간다.
   * 통화 종료는 종료·거절 버튼과 부재중 타이머만 한다. 통화 Activity 는 종료하지 않으므로 Runtime·FGS 는 그대로.
   */
  private boolean leavePreConnectedCallToApp(String source) {
    if (callId == null || callId.isEmpty()) return false;
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    if (session == null) {
      NativeVoiceCallLog.info("native_voice_back_stale_finish", callId, "source=" + source);
      finish();
      return true;
    }
    NativeVoiceCallRuntime.State state = session.state;
    if (state == null
        || state == NativeVoiceCallRuntime.State.CONNECTED
        || state == NativeVoiceCallRuntime.State.ENDING) {
      return false;
    }
    NativeVoiceCallLog.info(
        "native_voice_back_minimize_pre_connected", callId, "state=" + state + " source=" + source);
    return NativeCallAppReturn.bringAppToFront(this, callId, "back_pre_connected:" + source);
  }

  private boolean isLiveConnectedSession() {
    if (callId == null || callId.isEmpty()) return false;
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    return session != null && session.state == NativeVoiceCallRuntime.State.CONNECTED;
  }

  private void endLiveSessionIfSurfaceDestroyed() {
    if (isChangingConfigurations()) return;
    if (callId == null || callId.isEmpty()) return;
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    if (session == null || session.state == NativeVoiceCallRuntime.State.ENDING) return;
    NativeVoiceCallLog.info(
        "activity_destroyed_while_live", callId, "state=" + session.state);
    if (session.state == NativeVoiceCallRuntime.State.RINGING && !session.initiator) {
      NativeVoiceCallRuntime.reject(getApplicationContext(), callId);
    } else {
      NativeVoiceCallRuntime.end(getApplicationContext(), callId, "activity_destroyed");
    }
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    if (requestCode != REQUEST_CODE_ACCEPT_MEDIA) return;
    String source = pendingAcceptSource;
    pendingAcceptSource = null;
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED) {
      // WP-3 NEW-11: do not fail/reject silently. Keep the call ringing and tell the user.
      boolean permanentlyDenied =
          !ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.RECORD_AUDIO);
      NativeVoiceCallLog.info(
          "accept_permission_denied", callId, "kind=" + (permanentlyDenied ? "permanent" : "retryable"));
      if (noticeOverlay != null) {
        noticeOverlay.show(NativeCallInAppNoticeOverlay.Event.PERMISSION_REQUIRED);
      }
      if (permanentlyDenied) {
        // Remember the accept source so onResume can resume once the user grants in Settings.
        pendingSettingsAcceptSource = source;
        openAcceptAppSettings();
      }
      return;
    }
    resumeAccept(source);
  }

  private boolean bindIntent(Intent intent) {
    preparing = intent != null && intent.getBooleanExtra(EXTRA_PREPARING, false);
    attemptId = intent != null ? intent.getStringExtra(EXTRA_ATTEMPT_ID) : null;
    if (attemptId != null) attemptId = attemptId.trim();
    preparingPeerName = intent != null ? intent.getStringExtra(EXTRA_PEER_NAME) : null;
    callId = intent != null ? intent.getStringExtra(EXTRA_CALL_ID) : null;
    if (callId != null) callId = callId.trim();
    if (preparing && attemptId != null && !attemptId.isEmpty()) {
      if (callId == null || callId.isEmpty()) callId = attemptId;
      uiMode = UI_MODE_OUTGOING;
      return true;
    }
    preparing = false;
    if (callId == null || callId.isEmpty()) return false;
    String mode = intent != null ? intent.getStringExtra(EXTRA_UI_MODE) : null;
    uiMode = UI_MODE_OUTGOING.equals(mode) ? UI_MODE_OUTGOING : UI_MODE_INCOMING;
    return true;
  }

  private boolean claimVisibleSurface() {
    String surfaceKey = preparing && attemptId != null ? attemptId : callId;
    if (NativeCallVisibleSurfaceOwner.isClaimed(surfaceKey)) return true;
    if (preparing || UI_MODE_OUTGOING.equals(uiMode)) {
      return NativeCallVisibleSurfaceOwner.claim(
          surfaceKey, "voice", preparing ? "preparing" : "dialing");
    }
    return NativeCallVisibleSurfaceOwner.claim(callId, "voice", "incoming");
  }

  private NativeVoiceCallRuntime.State defaultStateForMode() {
    return UI_MODE_OUTGOING.equals(uiMode)
        ? NativeVoiceCallRuntime.State.CONNECTING
        : NativeVoiceCallRuntime.State.RINGING;
  }

  private void logSurfaceShown() {
    if (preparing) {
      NativeVoiceCallLog.info("native_preparing_surface_shown", attemptId != null ? attemptId : callId);
      return;
    }
    if (UI_MODE_OUTGOING.equals(uiMode)) {
      NativeVoiceCallLog.info("native_dialing_surface_shown", callId);
      return;
    }
    NativeVoiceCallLog.info("incoming_activity_shown", callId);
    NativeVoiceCallLog.info("lock_screen_visible", callId);
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
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    if (session == null || session.state != NativeVoiceCallRuntime.State.RINGING) {
      NativeVoiceCallLog.info(
          "accept_duplicate_blocked",
          callId,
          "source=" + source + " state=" + (session != null ? session.state : "missing"));
      return;
    }
    if (acceptStarted) {
      NativeVoiceCallLog.info("accept_duplicate_blocked", callId, "source=" + source + " reason=in_flight");
      return;
    }
    if (pendingAcceptSource != null) {
      NativeVoiceCallLog.info(
          "accept_duplicate_blocked", callId, "source=" + source + " reason=permission_prompt_pending");
      return;
    }
    if (!ensureAcceptMediaPermissions(source)) return;
    resumeAccept(source);
  }

  private void resumeAccept(String source) {
    acceptStarted = true;
    if ("notification".equals(source)) {
      NativeVoiceCallLog.info("activity_notification_accept", callId);
      NativeVoiceCallLog.info("state_accepting", callId);
    }
    NativeVoiceCallRuntime.accept(this, callId);
  }

  private boolean ensureAcceptMediaPermissions(String source) {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
        == PackageManager.PERMISSION_GRANTED) {
      return true;
    }
    if (ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.RECORD_AUDIO)
        || !acceptMediaPromptIssued) {
      acceptMediaPromptIssued = true;
      pendingAcceptSource = source;
      ActivityCompat.requestPermissions(
          this, new String[] {Manifest.permission.RECORD_AUDIO}, REQUEST_CODE_ACCEPT_MEDIA);
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
    mediaActions = findViewById(R.id.native_voice_call_media_actions);
    acceptButton = findViewById(R.id.native_voice_call_accept);
    declineButton = findViewById(R.id.native_voice_call_decline);
    speakerButton = findViewById(R.id.native_voice_call_speaker);
    videoButton = findViewById(R.id.native_voice_call_video);
    muteButton = findViewById(R.id.native_voice_call_mute);
    endButton = findViewById(R.id.native_voice_call_end);
    muteLabel = findViewById(R.id.native_voice_call_mute_label);
    topBar = findViewById(R.id.native_voice_call_top_bar);
    minimizeButton = findViewById(R.id.native_voice_call_minimize);
    IncomingCallUiInsets.applyTopSafeArea(topBar, 4);
    attachDockView();
    IncomingCallUiInsets.applyBottomSafeArea(incomingActions, 32);
    IncomingCallUiInsets.applyBottomSafeArea(mediaActions, 32);
  }

  private void bindActions() {
    acceptButton.setOnClickListener(v -> performAccept("button"));
    declineButton.setOnClickListener(v -> NativeVoiceCallRuntime.reject(this, callId));
    endButton.setOnClickListener(v -> onEndTapped());
    if (minimizeButton != null) {
      minimizeButton.setOnClickListener(v -> minimizeToApp("minimize_button"));
    }
    speakerButton.setOnClickListener(
        v -> {
          speakerEnabled = !speakerEnabled;
          NativeVoiceCallAgoraEngine.setSpeakerEnabled(speakerEnabled);
          updateControlChrome();
        });
    muteButton.setOnClickListener(
        v -> {
          if (!micChromeEnabled) return;
          // WP-3 NEW-28: apply real Agora mute first; only reflect UI/session on success.
          NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
          if (session == null) return;
          boolean next = !session.micMuted;
          if (!NativeVoiceCallAgoraEngine.setMicMuted(callId, next)) {
            if (noticeOverlay != null) {
              noticeOverlay.show(NativeCallInAppNoticeOverlay.Event.MIC_MUTE_FAILED);
            }
            return;
          }
          session.micMuted = next;
          micMutedChrome = next;
          if (muteLabel != null) {
            muteLabel.setText(
                getString(
                    next ? R.string.dibay_call_control_unmute : R.string.dibay_call_control_mute));
          }
          updateControlChrome();
        });
    // WP-3 NEW-27: voice→video upgrade is unwired (dead control). Hidden until WP-10 authority.
    if (videoButton != null) {
      View videoControl = (View) videoButton.getParent();
      (videoControl != null ? videoControl : videoButton).setVisibility(View.GONE);
    }
  }

  private void onEndTapped() {
    if (preparing && attemptId != null && !attemptId.isEmpty()) {
      NativeVoiceCallRuntime.abandonPreparingFromUi(this, attemptId, "end_button");
      return;
    }
    NativeVoiceCallRuntime.end(this, callId);
  }

  private void applyPreparingPresentation() {
    currentState = NativeVoiceCallRuntime.State.CONNECTING;
    String peer =
        preparingPeerName != null && !preparingPeerName.trim().isEmpty()
            ? IncomingCallUiCopy.sanitizeNickname(preparingPeerName.trim())
            : "DIBAY";
    if (peer.isEmpty()) peer = "DIBAY";
    peerNameView.setText(peer);
    statusView.setText(getString(R.string.dibay_voice_call_dialing));
    avatarInitialView.setText(IncomingCallUiCopy.peerInitial(peer));
    incomingActions.setVisibility(View.GONE);
    mediaActions.setVisibility(View.VISIBLE);
    micChromeEnabled = false;
    stopDurationTimer();
    connectedAtElapsedMs = 0L;
    durationView.setVisibility(View.GONE);
    updateControlChrome();
  }

  private void applyState(NativeVoiceCallRuntime.State state) {
    if (preparing) {
      applyPreparingPresentation();
      return;
    }
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
    micChromeEnabled = model.micChromeEnabled;
    // WP-3 NEW-28: restore mute chrome from the session so Activity recreation keeps the real state.
    if (session != null) micMutedChrome = session.micMuted;
    peerNameView.setText(model.peerName);
    statusView.setText(model.statusText);
    avatarInitialView.setText(model.avatarInitial);
    incomingActions.setVisibility(model.showIncomingActions ? View.VISIBLE : View.GONE);
    mediaActions.setVisibility(model.showMediaActions ? View.VISIBLE : View.GONE);
    if (model.showDuration) {
      ensureConnectedAt();
      durationView.setVisibility(View.VISIBLE);
      startDurationTimer();
    } else {
      stopDurationTimer();
      connectedAtElapsedMs = 0L;
      durationView.setVisibility(View.GONE);
    }
    updateControlChrome();
    syncMinimizeButton();
    if (inPipMode) applyPipUiMode(true);
  }

  /** 첫 연결 시각을 callId 별로 기억 — 화면을 다시 만들어도 시간이 이어진다. */
  private void ensureConnectedAt() {
    if (connectedAtElapsedMs > 0L) return;
    Long saved = callId != null ? CONNECTED_AT_BY_CALL.get(callId) : null;
    connectedAtElapsedMs = saved != null ? saved : SystemClock.elapsedRealtime();
    if (callId != null) CONNECTED_AT_BY_CALL.put(callId, connectedAtElapsedMs);
  }

  /** 줄이기 버튼 — 연결 후 전체화면에서만. */
  private void syncMinimizeButton() {
    if (minimizeButton == null) return;
    boolean show =
        !preparing
            && currentState == NativeVoiceCallRuntime.State.CONNECTED
            && !inPipMode
            && !dockMode
            && !isFinishing();
    minimizeButton.setVisibility(show ? View.VISIBLE : View.GONE);
  }

  /** S2 P2 — PiP 창에는 상대 이름·상태·시간만 (버튼·아바타·Dock 숨김). 해제 시 applyState 가 복원. */
  private void applyPipUiMode(boolean enabled) {
    View avatarFrame = avatarInitialView != null ? (View) avatarInitialView.getParent() : null;
    if (enabled) {
      if (dockMode) {
        dockMode = false;
        if (dockRoot != null) dockRoot.setVisibility(View.GONE);
      }
      if (incomingActions != null) incomingActions.setVisibility(View.GONE);
      if (mediaActions != null) mediaActions.setVisibility(View.GONE);
      if (avatarFrame != null) avatarFrame.setVisibility(View.GONE);
      if (topBar != null) topBar.setVisibility(View.GONE);
      return;
    }
    if (avatarFrame != null) avatarFrame.setVisibility(View.VISIBLE);
    if (topBar != null) topBar.setVisibility(View.VISIBLE);
    if (currentState != null) applyState(currentState);
  }

  private void updateControlChrome() {
    if (speakerButton == null || videoButton == null || muteButton == null || endButton == null) return;
    applyMediaDisk(speakerButton, speakerEnabled, false, false);
    speakerButton.setImageResource(
        speakerEnabled ? R.drawable.ic_call_speaker_on : R.drawable.ic_call_speaker_off);

    applyMediaDisk(videoButton, videoActiveChrome, false, false);
    videoButton.setImageResource(R.drawable.ic_call_video);

    boolean micActive = !micMutedChrome;
    applyMediaDisk(muteButton, micActive, !micChromeEnabled, false);
    muteButton.setImageResource(micActive ? R.drawable.ic_call_mic_on : R.drawable.ic_call_mic_off);
    muteButton.setEnabled(micChromeEnabled);
    if (muteLabel != null) {
      muteLabel.setText(
          getString(
              !micChromeEnabled
                  ? R.string.dibay_call_control_mute
                  : (micMutedChrome
                      ? R.string.dibay_call_control_unmute
                      : R.string.dibay_call_control_mute)));
    }

    applyMediaDisk(endButton, false, false, true);
    endButton.setImageResource(R.drawable.ic_call_end_x);
  }

  private void applyMediaDisk(ImageButton button, boolean active, boolean disabled, boolean danger) {
    int iconColor;
    if (danger) {
      button.setBackgroundResource(R.drawable.bg_call_control_danger);
      iconColor = Color.WHITE;
      button.setAlpha(1f);
    } else if (disabled) {
      button.setBackgroundResource(R.drawable.bg_call_control_neutral);
      iconColor = Color.WHITE;
      button.setAlpha(0.4f);
    } else {
      button.setAlpha(1f);
      if (active) {
        button.setBackgroundResource(R.drawable.bg_call_control_active);
        iconColor = ContextCompat.getColor(this, R.color.dibay_call_control_active_icon);
      } else {
        button.setBackgroundResource(R.drawable.bg_call_control_neutral);
        iconColor = Color.WHITE;
      }
    }
    button.setImageTintList(ColorStateList.valueOf(iconColor));
  }

  /**
   * S2 §12.3 — 「작게 하기」 공통 규칙: PiP 시도 → 실패 시 기존 Dock. Dock 동작·표시 조건은 기존 그대로.
   * 홈·최근앱(user_leave)은 이것만, 뒤로·줄이기 버튼은 minimizeToApp 이 이어서 앱을 앞으로 가져온다.
   */
  private boolean minimizeConnectedCall(String source) {
    if (!isDockEligible()) {
      NativeVoiceCallLog.info("native_voice_minimize_blocked", callId, "source=" + source + " state=" + currentState);
      return false;
    }
    if (tryEnterPip(source)) {
      NativeVoiceCallLog.info("native_voice_minimize_pip", callId, "source=" + source);
      return true;
    }
    showDock(source);
    boolean minimized = dockMode;
    NativeVoiceCallLog.info(
        minimized ? "native_voice_minimize_dock" : "native_voice_minimize_failed",
        callId,
        "source=" + source);
    return minimized;
  }

  /** 뒤로·줄이기 버튼 (CONNECTED): 기존 작게 하기(PiP→Dock) 후 앱(메신저)을 앞으로. 통화 종료 없음. */
  private boolean minimizeToApp(String source) {
    if (!isDockEligible()) return false;
    boolean pip = tryEnterPip(source);
    if (pip) {
      // PiP 창이 뜬 뒤(onPictureInPictureModeChanged) 앱을 앞으로 — 콜백이 늦으면 보조 타이머.
      pendingAppReturnSource = source;
      mainHandler.removeCallbacks(appReturnAfterPipFallback);
      mainHandler.postDelayed(appReturnAfterPipFallback, APP_RETURN_AFTER_PIP_FALLBACK_MS);
      NativeVoiceCallLog.info("native_voice_minimize_pip", callId, "source=" + source + " appReturn=pending");
      return true;
    }
    showDock(source + "_pip_fallback");
    NativeVoiceCallLog.info("native_voice_minimize_dock", callId, "source=" + source + " appReturn=now");
    NativeCallAppReturn.bringAppToFront(this, callId, source);
    return true;
  }

  private boolean tryEnterPip(String source) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
    if (inPipMode || isInPictureInPictureMode()) return true;
    if (!getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) return false;
    PictureInPictureParams params = NativeVoiceCallPipPresenter.buildParams(this, callId);
    if (params == null) return false;
    try {
      boolean entered = enterPictureInPictureMode(params);
      NativeVoiceCallLog.info(
          entered ? "native_voice_pip_request_accepted" : "native_voice_pip_request_rejected",
          callId,
          "source=" + source);
      return entered;
    } catch (RuntimeException error) {
      NativeVoiceCallLog.warn(
          "native_voice_pip_enter_failed", callId, "err=" + error.getClass().getSimpleName());
      return false;
    }
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
    syncMinimizeButton();
    NativeVoiceCallLog.info("native_voice_dock_shown", callId, "source=" + source);
  }

  private void hideDock(String source) {
    if (!dockMode) return;
    dockMode = false;
    if (dockRoot != null) dockRoot.setVisibility(View.GONE);
    syncMinimizeButton();
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
    if (mediaActions != null) mediaActions.setVisibility(View.GONE);
    dockRoot.setVisibility(View.VISIBLE);
    dockRoot.bringToFront();
    dockRoot.setTranslationZ(32f);
    ensureConnectedAt();
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
