package com.dibay.app.nativevideo;

import android.Manifest;
import android.animation.ValueAnimator;
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
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.dibay.app.IncomingCallUiCopy;
import com.dibay.app.IncomingCallUiInsets;
import com.dibay.app.R;
import com.dibay.app.DibayNativeLocale;
import android.content.Context;
import com.dibay.app.call.CallPipActionPlan;
import com.dibay.app.call.CallRecentsCardPresenter;
import com.dibay.app.call.NativeCallAppReturn;
import com.dibay.app.nativecall.NativeCallInAppNoticeOverlay;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;
import java.lang.ref.WeakReference;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/** Native-only video call UI. Never hosts WebView. Render-only over NativeVideoCallRuntime state. */
public class NativeVideoCallActivity extends Activity {

  /** 언어 SSOT S8-3: 통화 화면 문구 = 앱 언어(저장값 → 없으면 기기 언어). 기기 언어와 같으면 그대로 */
  @Override
  protected void attachBaseContext(Context newBase) {
    super.attachBaseContext(DibayNativeLocale.wrap(newBase));
  }
  public static final String EXTRA_CALL_ID = "callId";
  public static final String EXTRA_UI_MODE = "uiMode";
  public static final String EXTRA_SHOW_DOCK = "showDock";
  public static final String EXTRA_NOTIFICATION_ACCEPT = "notificationAccept";
  /** CUT-5C — local attempt id while PREPARING (no server session yet). */
  public static final String EXTRA_ATTEMPT_ID = "attemptId";
  public static final String EXTRA_PREPARING = "preparing";
  public static final String EXTRA_PEER_NAME = "peerName";
  public static final String ACTION_NOTIFICATION_ACCEPT = "com.dibay.app.nativevideo.NOTIFICATION_ACCEPT";
  public static final String UI_MODE_INCOMING = "incoming";
  public static final String UI_MODE_OUTGOING = "outgoing";
  public static final String UI_MODE_CONNECTED_RESTORE = "connected_restore";

  private static WeakReference<NativeVideoCallActivity> activeRef = new WeakReference<>(null);
  /** S2 — 화면이 다시 만들어져도(PiP 닫은 뒤 복귀) 통화 시간이 이어지도록 callId 별 연결 시각. UI 전용. */
  private static final ConcurrentHashMap<String, Long> CONNECTED_AT_BY_CALL = new ConcurrentHashMap<>();
  private static final long APP_RETURN_AFTER_PIP_FALLBACK_MS = 800L;
  private static final int REQUEST_CODE_ACCEPT_MEDIA = 0xD1C1;
  private static final long PIP_REQUEST_TIMEOUT_MS = 1_500L; // Diagnostic only; callback is the success SSOT.
  /** 연결·전체 화면 버튼 자동 숨김 — 마지막 조작 후 5초 (Owner 2026-11-12 · 08-31 설계값). */
  private static final long CONNECTED_CHROME_HIDE_DELAY_MS = 5_000L;
  private static final long CONNECTED_CHROME_FADE_MS = 200L;
  private static final int LOCAL_PIP_WIDTH_DP = 120;
  private static final int LOCAL_PIP_HEIGHT_DP = 213;
  private static final int LOCAL_PIP_MARGIN_DP = 16;
  private static final int CONNECTED_CONTROLS_DESIGN_MARGIN_DP = 12;

  private enum PipState {
    PIP_IDLE,
    PIP_REQUESTED,
    PIP_ACTIVE
  }

  private String callId;
  private String attemptId;
  private String preparingPeerName;
  private boolean preparing;
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
  private ImageButton endButton;
  private TextView endLabelView;
  private TextView micLabelView;
  /** SSOT §4-1 — 마지막으로 넘긴 PiP 파라미터 키 (상태가 바뀔 때만 다시 넘김). */
  private String lastPipParamsKey;
  private ImageButton cameraButton;
  private ImageButton micButton;
  private View dockRoot;
  private View topBar;
  private ImageButton minimizeButton;
  /** S2 P3 — PiP 상태에서 화면이 멈춤(onStop) = 사용자가 PiP 창을 닫았거나 화면 꺼짐. 이때 파괴돼도 통화 유지. */
  private boolean stoppedInPip = false;
  /** onCreate 를 끝까지 통과해 화면을 소유한 인스턴스만 파괴 시 「화면 사라짐」을 알린다(중복·무효 인스턴스 제외). */
  private boolean surfaceEstablished = false;
  /** PiP 진입 후 앱(메신저)을 앞으로 가져올 요청 출처 — null 이면 앱 복귀 안 함(홈 버튼 등). */
  private String pendingAppReturnSource;
  private ImageButton cameraFlipButton;
  private FrameLayout connectedChromeOverlay;
  private LinearLayout connectedInfoPanel;
  private TextView connectedPeerNameView;
  private TextView connectedDurationView;
  private TextView connectedSignalLabelView;
  private View[] connectedSignalBars = new View[3];
  private CallSignalEdgeView signalEdgeView;
  private int systemBarsLeft;
  private int systemBarsTop;
  private int systemBarsRight;
  private int systemBarsBottom;
  private final NativeVideoNetworkTier networkTier = new NativeVideoNetworkTier();
  private boolean networkVeryPoorActive;
  private boolean cameraEnabled = true;
  private boolean micMuted = false;
  private boolean chromeVisible = false;
  private boolean wasConnectedFullscreen = false;
  private boolean inPipMode = false;
  private PipState pipState = PipState.PIP_IDLE;
  private String lastPipSource = "";
  private long lastPipRequestAt = 0L;
  private boolean dockMode = false;
  private NativeCallInAppNoticeOverlay noticeOverlay;
  private boolean finishingWithNotice;
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
  private int backgroundTapSlop = 0;
  private boolean backgroundTapTracking = false;
  private boolean backgroundTapMoved = false;
  private float backgroundTapStartX = 0f;
  private float backgroundTapStartY = 0f;
  private boolean outgoingLocalFirstFrameReady = false;
  private boolean outgoingRemoteFirstFrameReady = false;
  private boolean outgoingTransitionRunning = false;
  private boolean outgoingTransitionCompleted = false;
  private int outgoingTransitionGeneration = 0;
  private ValueAnimator outgoingLocalToPipAnimator;
  private int[] lockedOutgoingPipTargetRect = null;
  private int pipLayoutPassCount = 0;
  private NativeVideoCallRuntime.State currentState = NativeVideoCallRuntime.State.RINGING;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private long connectedAtElapsedMs = 0L;
  /** 마지막 메신저 복귀 요청 시각(elapsedRealtime) — 확인 판정 기준. */
  private long appReturnRequestedAtMs = 0L;
  /** §7 — 메신저를 연 직후 통화 화면이 받는 onUserLeaveHint 1회를 건너뛰기 위한 시각(elapsedRealtime, 0 = 없음). */
  private long skipUserLeavePipUntilMs = 0L;
  /** §7 — 자동 PiP 확인 대기 중인 출처(null = 대기 없음). */
  private String autoPipPendingSource;
  private static final long AUTO_PIP_CHECK_MS = 1_500L;
  private static final long SKIP_USER_LEAVE_WINDOW_MS = 2_000L;
  private final Runnable autoPipMissedCheck =
      new Runnable() {
        @Override
        public void run() {
          if (autoPipPendingSource == null) return;
          String source = autoPipPendingSource;
          autoPipPendingSource = null;
          boolean pip = inPipMode || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isInPictureInPictureMode());
          if (!pip) {
            // 통화는 유지(판단표 KEEP) — 복귀 수단: 진행 중 알림·통화 바·최근 앱 카드.
            NativeVideoCallLog.warn("native_video_auto_pip_missed", callId, "source=" + source + " state=" + currentState);
          }
        }
      };
  private final Runnable appReturnAfterPipFallback =
      new Runnable() {
        @Override
        public void run() {
          if (pendingAppReturnSource == null) return;
          String source = pendingAppReturnSource;
          pendingAppReturnSource = null;
          NativeVideoCallLog.info("native_video_app_return_after_pip_timeout", callId, "source=" + source);
          confirmOrRetryAppReturn(source, "timeout");
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
  private final Runnable requestVerificationRunnable =
      new Runnable() {
        @Override
        public void run() {
          verifyPipRequestTimeout();
        }
      };
  private final Runnable chromeHideRunnable =
      new Runnable() {
        @Override
        public void run() {
          hideConnectedChrome("timeout");
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
          activity.applyOutgoingLocalLayoutAfterAttach("attach_local");
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
          NativeVideoCallAcceptTiming.markSurfaceAttached(callId);
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

  public static void onOutgoingLocalFirstFrameReady(String callId, int width, int height) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    activity.runOnUiThread(() -> activity.handleOutgoingLocalFirstFrameReady(width, height));
  }

  public static void onOutgoingRemoteUserJoined(String callId, int uid) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    activity.runOnUiThread(
        () ->
            NativeVideoCallLog.info(
                "outgoing_remote_user_joined",
                callId,
                activity.buildOutgoingVideoLogDetails("uid=" + uid)));
  }

  public static void onOutgoingRemoteFirstFrameReady(String callId, int uid, int width, int height) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    activity.runOnUiThread(() -> activity.handleOutgoingRemoteFirstFrameReady(uid, width, height));
  }

  public static boolean ensureVideoRootForRemoteRender(String callId) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return false;
    if (Looper.myLooper() != Looper.getMainLooper()) return false;
    return activity.ensureVideoRootForRemoteRender();
  }

  public static void finishIfActive(String callId) {
    finishIfActive(callId, null);
  }

  public static void finishIfActive(String callId, String reason) {
    if (callId != null) CONNECTED_AT_BY_CALL.remove(callId.trim());
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    // END UX: terminal surface exit must not wait for in-app notice duration (~1.6s).
    // Notice overlay is presentation-only; cleanup/SESSIONS authority stays in Runtime.
    activity.runOnUiThread(
        () -> {
          if (activity.isFinishing()) return;
          activity.finish();
        });
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

  public static boolean isShowingPreparing(String attemptId) {
    NativeVideoCallActivity activity = activeRef.get();
    return activity != null
        && activity.preparing
        && attemptId != null
        && attemptId.equals(activity.attemptId);
  }

  /** CUT-5C — remap PREPARING Activity onto real session callId without recreate. */
  public static boolean bindToCallId(String attemptId, String callId) {
    NativeVideoCallActivity activity = activeRef.get();
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
          NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(sid);
          if (session != null) {
            activity.applyState(session.state);
          } else {
            activity.applyState(NativeVideoCallRuntime.State.CONNECTING);
          }
        });
    return true;
  }

  public static void finishIfPreparing(String attemptId) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || attemptId == null) return;
    String aid = attemptId.trim();
    if (aid.isEmpty()) return;
    if (activity.attemptId == null || !aid.equals(activity.attemptId)) return;
    if (!activity.preparing) return;
    activity.runOnUiThread(
        () -> {
          if (!activity.isFinishing()) activity.finish();
        });
  }

  /**
   * Wave-1 M3: MainActivity back/home must prefer Native Video Activity minimize
   * ({@link #minimizeConnectedCall}) over MainActivity system PiP.
   */
  public static boolean requestMinimizeConnectedCall(String source) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null) return false;
    String src = source != null ? source : "external";
    if (Looper.myLooper() == Looper.getMainLooper()) {
      return activity.minimizeConnectedCall(src);
    }
    activity.runOnUiThread(() -> activity.minimizeConnectedCall(src));
    return true;
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
    if (UI_MODE_INCOMING.equals(uiMode)
        && !com.dibay.app.DibayCallAuthEligibilityStore.isMemberCallEligible(this)) {
      NativeVideoCallLog.warn(
          "incoming_activity_blocked_guest_ineligible",
          callId,
          "reason=member_call_not_eligible");
      NativeVideoCallRuntime.dismissIneligibleIncomingLocally(getApplicationContext(), callId);
      finish();
      return;
    }
    // Wave-1 R4: H1/Voice twin — no session ⇒ no zombie shell (before surface claim).
    // CUT-5C: PREPARING may show before server session exists.
    if (!preparing && NativeVideoCallRuntime.getSession(callId) == null) {
      NativeVideoCallLog.info("stale_activity_finish", callId, "reason=no_session");
      finish();
      return;
    }
    if (!claimVisibleSurface()) {
      finish();
      return;
    }
    activeRef = new WeakReference<>(this);
    surfaceEstablished = true;
    if (UI_MODE_INCOMING.equals(uiMode)) {
      applyIncomingWakeFlags();
    }
    setContentView(R.layout.activity_native_video_call);
    bindViews();
    noticeOverlay = NativeCallInAppNoticeOverlay.attach(this);
    bindActions();
    NativeVideoCallAgoraEngine.setNetworkQualityObserver(this::handleNetworkQualitySample);
    NativeVideoCallAgoraEngine.setConnectionStateObserver(this::handleAgoraConnectionState);
    logSurfaceShown();
    if (preparing) {
      applyPreparingPresentation();
      registerNativeVideoBackCallback();
      return;
    }
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (session == null) {
      NativeVideoCallLog.info("stale_activity_finish", callId, "reason=no_session");
      finish();
      return;
    }
    if (session.state == NativeVideoCallRuntime.State.CONNECTED) {
      currentState = session.state;
      syncOutgoingFlagsForConnectedLayoutRestore();
    }
    applyState(session.state);
    maybeHandleNotificationAccept(getIntent());
    maybeReattachSurfacesAfterConnectedRestore();
    if (currentState == NativeVideoCallRuntime.State.CONNECTED) {
      restoreConnectedFullscreenVideoLayout("connected_restore");
    }
    registerNativeVideoBackCallback();
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
  protected void onStart() {
    super.onStart();
    stoppedInPip = false;
  }

  @Override
  protected void onStop() {
    super.onStop();
    if (inPipMode || isInPictureInPictureMode()) stoppedInPip = true;
    NativeVideoCallLog.info("native_video_pip_activity_stopped", callId, buildPipLogDetails("stop"));
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
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (session == null) {
      NativeVideoCallLog.info("stale_activity_finish", callId, "reason=no_session");
      finish();
      return;
    }
    // S2 §12.3-4: 통화 바·알림 등으로 돌아오면 Dock 을 풀고 전체 화면 (음성 onNewIntent 규칙과 동일).
    if (dockMode) {
      hideDock("new_intent_resume");
    }
    applyState(session.state);
    maybeHandleNotificationAccept(intent);
    maybeReattachSurfacesAfterConnectedRestore();
    if (currentState == NativeVideoCallRuntime.State.CONNECTED) {
      restoreConnectedFullscreenVideoLayout("connected_restore");
    }
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
    if (skipUserLeavePipUntilMs > 0L && SystemClock.elapsedRealtime() <= skipUserLeavePipUntilMs) {
      // §7 — 방금 메신저를 startActivity 로 열어 생긴 onUserLeaveHint: 자동 PiP 에 맡기고 PiP 를 또 요청하지 않는다.
      skipUserLeavePipUntilMs = 0L;
      NativeVideoCallLog.info("native_video_user_leave_skipped", callId, "reason=app_return_open");
      return;
    }
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
    if (preparing && attemptId != null && !attemptId.isEmpty()) {
      // A2: 준비 중 뒤로는 발신 취소가 아니다(취소는 종료 버튼만). 화면만 내리고 앱으로 간다.
      NativeVideoCallLog.info("native_video_back_minimize_preparing", attemptId, "source=" + source);
      NativeCallAppReturn.bringAppToFront(this, attemptId, "back_preparing:" + source);
      return;
    }
    if (minimizeToApp(source)) {
      return;
    }
    if (leavePreConnectedCallToApp(source)) {
      return;
    }
    NativeVideoCallLog.info(
        "native_video_back_blocked", callId, "state=" + currentState + " source=" + source);
  }

  /**
   * S2 P1 (Owner 2026-10-30): 연결 전(벨·연결 중) 뒤로는 취소·거절이 아니다. 화면만 내리고 앱으로 간다.
   * 통화 종료는 종료·거절 버튼과 부재중 타이머만 한다. 통화 Activity 는 종료하지 않으므로 Runtime·FGS 는 그대로.
   */
  private boolean leavePreConnectedCallToApp(String source) {
    if (callId == null || callId.isEmpty()) return false;
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (session == null) {
      NativeVideoCallLog.info("native_video_back_stale_finish", callId, "source=" + source);
      finish();
      return true;
    }
    NativeVideoCallRuntime.State state = session.state;
    if (state == null
        || state == NativeVideoCallRuntime.State.CONNECTED
        || state == NativeVideoCallRuntime.State.ENDING) {
      return false;
    }
    NativeVideoCallLog.info(
        "native_video_back_minimize_pre_connected", callId, "state=" + state + " source=" + source);
    return NativeCallAppReturn.bringAppToFront(this, callId, "back_pre_connected:" + source);
  }

  private boolean isLiveConnectedSession() {
    if (callId == null || callId.isEmpty()) return false;
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    return session != null && session.state == NativeVideoCallRuntime.State.CONNECTED;
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
    syncMinimizeButton();
    if (isInPictureInPictureMode && autoPipPendingSource != null) {
      mainHandler.removeCallbacks(autoPipMissedCheck);
      NativeVideoCallLog.info("native_video_auto_pip_entered", callId, "source=" + autoPipPendingSource);
      autoPipPendingSource = null;
    }
    if (isInPictureInPictureMode && pendingAppReturnSource != null) {
      mainHandler.removeCallbacks(appReturnAfterPipFallback);
      String source = pendingAppReturnSource;
      pendingAppReturnSource = null;
      confirmOrRetryAppReturn(source, "pip_callback");
    }
  }

  @Override
  protected void onDestroy() {
    mainHandler.removeCallbacks(autoPipMissedCheck);
    NativeVideoCallLog.info("native_video_pip_activity_destroyed", callId, buildPipLogDetails("destroy"));
    if (isFinishing()) CallRecentsCardPresenter.apply(this, false, null, "video:destroy");
    unregisterNativeVideoBackCallback();
    clearPipRequestVerification();
    cancelConnectedChromeHide("destroy");
    cancelOutgoingVideoTransition("destroy");
    NativeVideoCallAgoraEngine.setNetworkQualityObserver(null);
    NativeVideoCallAgoraEngine.setConnectionStateObserver(null);
    pipState = PipState.PIP_IDLE;
    stopDurationTimer();
    hideDock("destroy");
    detachDockView();
    NativeVideoCallActivity current = activeRef.get();
    if (current == this) activeRef = new WeakReference<>(null);
    mainHandler.removeCallbacks(appReturnAfterPipFallback);
    reportSurfaceLost();
    super.onDestroy();
  }

  /**
   * A1·A2 (call-termination-authority-audit §2-2): 화면 파괴(최근 앱 카드 제거·OS/OEM 정리·Dock 정리·PiP 닫기)는
   * 통화를 끝내지 않는다. Runtime 판단 함수에 SURFACE_LOST 로 알리고(KEEP), 돌아갈 수단(수신 알림·진행 중 통화 알림)은
   * Runtime 이 보장한다. 재생성 시 영상 재부착은 기존 경로(S2)를 따른다.
   */
  private void reportSurfaceLost() {
    if (!surfaceEstablished || isChangingConfigurations()) return;
    if (preparing && attemptId != null && !attemptId.isEmpty()) {
      NativeVideoCallLog.info("native_video_preparing_surface_lost_kept", attemptId);
      return;
    }
    if (callId == null || callId.isEmpty()) return;
    if (stoppedInPip && isLiveConnectedSession()) {
      NativeVideoCallLog.info("native_video_pip_dismissed_call_kept", callId, "state=" + currentState);
    }
    NativeVideoCallRuntime.onSurfaceLost(
        getApplicationContext(), callId, stoppedInPip ? "pip_dismissed" : "activity_destroyed");
  }

  private boolean bindIntent(Intent intent) {
    String previousCallId = callId;
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
    String surfaceKey = preparing && attemptId != null ? attemptId : callId;
    if (NativeCallVisibleSurfaceOwner.isClaimed(surfaceKey)) return true;
    if (preparing || UI_MODE_OUTGOING.equals(uiMode)) {
      return NativeCallVisibleSurfaceOwner.claim(
          surfaceKey, "video", preparing ? "preparing" : "dialing");
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
    if (preparing) {
      NativeVideoCallLog.info(
          "native_preparing_surface_shown", attemptId != null ? attemptId : callId);
      return;
    }
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
    backgroundTapSlop = ViewConfiguration.get(this).getScaledTouchSlop();
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
    micButton = findViewById(R.id.native_video_call_mic);
    endLabelView = findViewById(R.id.native_video_call_end_label);
    micLabelView = findViewById(R.id.native_video_call_mic_label);
    cameraFlipButton = findViewById(R.id.native_video_call_camera_flip);
    connectedChromeOverlay = findViewById(R.id.native_video_call_connected_chrome);
    topBar = findViewById(R.id.native_video_call_top_bar);
    minimizeButton = findViewById(R.id.native_video_call_minimize);
    IncomingCallUiInsets.applyTopSafeArea(topBar, 4);
    connectedInfoPanel = findViewById(R.id.native_video_call_connected_info);
    connectedPeerNameView = findViewById(R.id.native_video_call_connected_peer_name);
    connectedDurationView = findViewById(R.id.native_video_call_connected_duration);
    connectedSignalLabelView = findViewById(R.id.native_video_call_signal_label);
    connectedSignalBars[0] = findViewById(R.id.native_video_call_signal_bar_1);
    connectedSignalBars[1] = findViewById(R.id.native_video_call_signal_bar_2);
    connectedSignalBars[2] = findViewById(R.id.native_video_call_signal_bar_3);
    signalEdgeView = findViewById(R.id.native_video_call_signal_edge);
    attachSignalEdgeInsetsListener();
    attachDockView();
    attachConnectedControlsInsetsListener();
    attachLocalPipInsetsListener();
    attachBackgroundChromeTapListener();
    attachLocalPipDragListener();
    applyLocalPreviewLayout();
    localContainer.post(this::applyDefaultLocalPipPosition);
    IncomingCallUiInsets.applyTopSafeArea(connectedInfoPanel, 8);
    IncomingCallUiInsets.applyBottomSafeArea(incomingActions, 32);
  }

  private void bindActions() {
    acceptButton.setOnClickListener(v -> performAccept("button"));
    declineButton.setOnClickListener(v -> NativeVideoCallRuntime.reject(this, callId));
    endButton.setOnClickListener(
        v -> {
          if (consumeTapWhileChromeHidden("end")) return;
          onEndTapped();
        });
    if (minimizeButton != null) {
      minimizeButton.setOnClickListener(
          v -> {
            if (consumeTapWhileChromeHidden("minimize")) return;
            minimizeToApp("minimize_button");
          });
    }
    cameraFlipButton.setOnClickListener(
        v -> {
          if (consumeTapWhileChromeHidden("camera_flip")) return;
          NativeVideoCallAgoraEngine.switchCameraFacing();
          showConnectedChrome("camera_flip");
        });
    cameraButton.setOnClickListener(
        v -> {
          if (consumeTapWhileChromeHidden("camera")) return;
          onCameraTapped("button");
        });
    micButton.setOnClickListener(
        v -> {
          if (consumeTapWhileChromeHidden("mic")) return;
          onMicTapped("button");
        });
  }

  private void onEndTapped() {
    if (preparing && attemptId != null && !attemptId.isEmpty()) {
      NativeVideoCallRuntime.abandonPreparingFromUi(this, attemptId, "end_button");
      return;
    }
    NativeVideoCallRuntime.end(this, callId);
  }

  private void applyPreparingPresentation() {
    currentState = NativeVideoCallRuntime.State.CONNECTING;
    String peer =
        preparingPeerName != null && !preparingPeerName.trim().isEmpty()
            ? IncomingCallUiCopy.sanitizeNickname(preparingPeerName.trim())
            : "DIBAY";
    if (peer.isEmpty()) peer = "DIBAY";
    peerNameView.setText(peer);
    statusView.setText(getString(R.string.dibay_video_call_calling));
    avatarInitialView.setText(IncomingCallUiCopy.peerInitial(peer));
    incomingActions.setVisibility(View.GONE);
    activeActions.setVisibility(View.VISIBLE);
    if (connectedControls != null) connectedControls.setVisibility(View.GONE);
    if (videoRoot != null) videoRoot.setVisibility(View.GONE);
    if (localContainer != null) localContainer.setVisibility(View.GONE);
    if (statusPanel != null) statusPanel.setVisibility(View.VISIBLE);
    if (overlayRoot != null) {
      overlayRoot.setBackgroundResource(R.drawable.bg_dibay_incoming_fullscreen);
    }
    peerNameView.setTextColor(getResources().getColor(R.color.dibay_incoming_text_primary, getTheme()));
    statusView.setTextColor(getResources().getColor(R.color.dibay_incoming_text_muted, getTheme()));
    stopDurationTimer();
    connectedAtElapsedMs = 0L;
    if (durationView != null) durationView.setVisibility(View.GONE);
    activeActions.bringToFront();
    activeActions.setTranslationZ(32f);
    if (endLabelView != null) endLabelView.setText(R.string.dibay_video_call_cancel);
  }

  private void applyState(NativeVideoCallRuntime.State state) {
    if (preparing) {
      applyPreparingPresentation();
      return;
    }
    currentState = state;
    if (state != NativeVideoCallRuntime.State.CONNECTED && dockMode) {
      hideDock("state_change");
    }
    if (state == NativeVideoCallRuntime.State.ENDING
        || state == NativeVideoCallRuntime.State.ENDED
        || state == NativeVideoCallRuntime.State.FAILED) {
      cancelConnectedChromeHide("terminal_state");
      cancelOutgoingVideoTransition("terminal_state");
      wasConnectedFullscreen = false;
      networkTier.reset();
      networkVeryPoorActive = false;
      clearPipRequestVerification();
      pipState = PipState.PIP_IDLE;
      detachDockView();
    }
    if (dockMode && state == NativeVideoCallRuntime.State.CONNECTED) {
      cancelConnectedChromeHide("dock_state");
      wasConnectedFullscreen = false;
      applyDockPresentation();
      return;
    }
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    NativeVideoCallUiPresenter.Model model = NativeVideoCallUiPresenter.build(this, session, state);
    boolean outgoingPresentation = isOutgoingVideoPresentation(session);
    peerNameView.setText(model.peerName);
    statusView.setText(model.statusText);
    avatarInitialView.setText(model.avatarInitial);
    incomingActions.setVisibility(model.showIncomingActions ? View.VISIBLE : View.GONE);
    if (!model.showConnectedControls && !outgoingPresentation) {
      activeActions.setVisibility(model.showActiveActions ? View.VISIBLE : View.GONE);
      connectedControls.setVisibility(View.GONE);
    } else if (outgoingPresentation && !isTerminalState(state)) {
      activeActions.setVisibility(View.VISIBLE);
      connectedControls.setVisibility(View.VISIBLE);
      updateConnectedControlChrome();
    }
    if (outgoingPresentation && !isTerminalState(state)) {
      applyOutgoingVideoPresentation(model, state);
    } else {
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
    }
    if (model.showDuration) {
      ensureConnectedAt();
      durationView.setVisibility(View.VISIBLE);
      startDurationTimer();
    } else {
      stopDurationTimer();
      connectedAtElapsedMs = 0L;
      durationView.setVisibility(View.GONE);
    }
    if (outgoingPresentation && !outgoingTransitionCompleted) {
      durationView.setVisibility(View.GONE);
    }
    if (model.showVideoSurfaces || outgoingPresentation) {
      if (connectedChromeOverlay != null) {
        connectedChromeOverlay.bringToFront();
        connectedChromeOverlay.setTranslationZ(20f);
      }
      activeActions.bringToFront();
      activeActions.setTranslationZ(32f);
      ensureVideoRootForRemoteRender();
      NativeVideoCallAgoraEngine.onRemoteRenderSurfaceReady(callId);
    }
    updateConnectedInfoPanel(model);
    if (inPipMode) applyPipUiMode(true);
    boolean connectedFullscreenNow =
        model.showConnectedControls
            && isConnectedFullscreenPresentation()
            && (!outgoingPresentation || outgoingTransitionCompleted);
    if (connectedFullscreenNow) {
      updateConnectedControlChrome();
      if (!wasConnectedFullscreen) {
        showConnectedChrome("connected_enter");
      } else if (!chromeVisible) {
        // 자동 숨김 상태 유지 — 위 경로(발신 화면 등)가 버튼을 다시 VISIBLE 로 만든 것을 되돌린다.
        applyConnectedChromeHidden(false);
      }
    } else {
      cancelConnectedChromeHide("state_not_connected");
      chromeVisible = false;
      syncPersistentCallStatusVisibility();
    }
    wasConnectedFullscreen = connectedFullscreenNow;
    if (endLabelView != null) endLabelView.setText(model.endButtonLabel);
    refreshPipParams("state_" + state.name().toLowerCase(Locale.ROOT));
    applyRecentsCard(state, session);
  }

  /** SSOT §6 — 연결된 동안만 최근 앱에 통화 카드, 그 밖(벨·연결 중·종료)은 숨김. 잔류 0. */
  private void applyRecentsCard(NativeVideoCallRuntime.State state, NativeVideoCallRuntime.Session session) {
    boolean visible = state == NativeVideoCallRuntime.State.CONNECTED && !isFinishing();
    CallRecentsCardPresenter.apply(
        this, visible, session != null ? session.callerName : null, "video:" + state.name().toLowerCase(Locale.ROOT));
  }

  private boolean isOutgoingVideoPresentation(NativeVideoCallRuntime.Session session) {
    return session != null
        && session.initiator
        && (UI_MODE_OUTGOING.equals(uiMode) || UI_MODE_CONNECTED_RESTORE.equals(uiMode));
  }

  private boolean shouldSkipConnectedPipLayout() {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    return isOutgoingVideoPresentation(session)
        && !outgoingTransitionCompleted
        && !outgoingTransitionRunning;
  }

  private boolean isTerminalState(NativeVideoCallRuntime.State state) {
    return state == NativeVideoCallRuntime.State.ENDING
        || state == NativeVideoCallRuntime.State.ENDED
        || state == NativeVideoCallRuntime.State.FAILED;
  }

  private void applyOutgoingVideoPresentation(
      NativeVideoCallUiPresenter.Model model, NativeVideoCallRuntime.State state) {
    videoRoot.setVisibility(View.VISIBLE);
    if (!outgoingTransitionCompleted && !outgoingTransitionRunning) {
      applyOutgoingLocalFullscreenLayout();
    } else if (outgoingTransitionCompleted) {
      applyConnectedLocalPipLayout("outgoing_presentation_connected");
    }
    remoteContainer.setVisibility(outgoingRemoteFirstFrameReady ? View.VISIBLE : View.INVISIBLE);
    remoteContainer.setAlpha(outgoingRemoteFirstFrameReady ? 1f : 0f);
    localContainer.setVisibility(outgoingLocalFirstFrameReady ? View.VISIBLE : View.INVISIBLE);
    localContainer.setAlpha(outgoingLocalFirstFrameReady ? 1f : 0f);
    localContainer.setEnabled(outgoingTransitionCompleted && state == NativeVideoCallRuntime.State.CONNECTED);
    activeActions.setVisibility(View.VISIBLE);
    activeActions.setEnabled(true);
    connectedControls.setVisibility(View.VISIBLE);
    connectedControls.setEnabled(true);
    updateConnectedControlChrome();
    NativeVideoCallLog.info(
        "outgoing_controls_visible", callId, buildOutgoingVideoLogDetails("reason=outgoing_presentation"));
    NativeVideoCallLog.info(
        "outgoing_end_call_visible", callId, buildOutgoingVideoLogDetails("handler=NativeVideoCallRuntime.end"));
    statusPanel.setVisibility(outgoingTransitionCompleted ? View.GONE : View.VISIBLE);
    if (outgoingLocalFirstFrameReady) {
      overlayRoot.setBackgroundColor(Color.TRANSPARENT);
      peerNameView.setTextColor(Color.WHITE);
      statusView.setTextColor(Color.LTGRAY);
      if (!outgoingTransitionCompleted) {
        NativeVideoCallLog.info(
            "outgoing_avatar_visible", callId, buildOutgoingVideoLogDetails("source=avatar_initial"));
      }
      NativeVideoCallLog.info(
          "outgoing_local_fullscreen_visible",
          callId,
          buildOutgoingVideoLogDetails("phase=" + model.phase.name()));
    } else {
      overlayRoot.setBackgroundResource(R.drawable.bg_dibay_incoming_fullscreen);
      peerNameView.setTextColor(getResources().getColor(R.color.dibay_incoming_text_primary, getTheme()));
      statusView.setTextColor(getResources().getColor(R.color.dibay_incoming_text_muted, getTheme()));
      NativeVideoCallLog.info(
          "outgoing_video_ui_preparing",
          callId,
          buildOutgoingVideoLogDetails("phase=" + model.phase.name()));
    }
    if (state == NativeVideoCallRuntime.State.CONNECTED && outgoingRemoteFirstFrameReady) {
      maybeStartOutgoingLocalToPipTransition("apply_state_connected");
    }
    if (outgoingTransitionCompleted) {
      NativeVideoCallLog.info("outgoing_avatar_hidden", callId, buildOutgoingVideoLogDetails("reason=connected"));
      NativeVideoCallLog.info("outgoing_duration_visible", callId, buildOutgoingVideoLogDetails("source=connectedAt"));
      NativeVideoCallLog.info("outgoing_signal_visible", callId, buildOutgoingVideoLogDetails("source=agora_networkQuality"));
      NativeVideoCallLog.info("outgoing_controls_layout_restored", callId, buildOutgoingVideoLogDetails("reason=connected"));
    }
  }

  private void applyOutgoingLocalLayoutAfterAttach(String reason) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (!isOutgoingVideoPresentation(session) || isTerminalState(currentState)) return;
    if (outgoingTransitionCompleted) {
      applyConnectedLocalPipLayout("attach_local_connected");
    } else {
      applyOutgoingLocalFullscreenLayout();
      localContainer.setVisibility(outgoingLocalFirstFrameReady ? View.VISIBLE : View.INVISIBLE);
      localContainer.setAlpha(outgoingLocalFirstFrameReady ? 1f : 0f);
    }
    NativeVideoCallLog.info(
        "outgoing_video_ui_preparing", callId, buildOutgoingVideoLogDetails("reason=" + reason));
  }

  private void handleOutgoingLocalFirstFrameReady(int width, int height) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (!isOutgoingVideoPresentation(session) || outgoingLocalFirstFrameReady) return;
    outgoingLocalFirstFrameReady = true;
    NativeVideoCallLog.info(
        "outgoing_local_first_frame_ready",
        callId,
        buildOutgoingVideoLogDetails("width=" + width + " height=" + height));
    applyState(currentState);
    maybeStartOutgoingLocalToPipTransition("local_first_frame");
  }

  private void handleOutgoingRemoteFirstFrameReady(int uid, int width, int height) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (!isOutgoingVideoPresentation(session) || outgoingRemoteFirstFrameReady) return;
    outgoingRemoteFirstFrameReady = true;
    NativeVideoCallLog.info(
        "outgoing_remote_first_frame_ready",
        callId,
        buildOutgoingVideoLogDetails("uid=" + uid + " width=" + width + " height=" + height));
    maybeStartOutgoingLocalToPipTransition("remote_first_frame");
  }

  private void maybeStartOutgoingLocalToPipTransition(String reason) {
    if (suppressOutgoingTransitionRestart) {
      logOutgoingTransitionSkipped("layout_restore");
      return;
    }
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (!isOutgoingVideoPresentation(session)
        || currentState != NativeVideoCallRuntime.State.CONNECTED
        || isFinishing()
        || isDestroyed()
        || outgoingTransitionRunning
        || outgoingTransitionCompleted) {
      logOutgoingTransitionSkipped(reason);
      return;
    }
    if (!outgoingLocalFirstFrameReady || !outgoingRemoteFirstFrameReady) {
      logOutgoingTransitionSkipped(reason);
      return;
    }
    if (localContainer == null || videoRoot == null || videoRoot.getWidth() <= 0 || videoRoot.getHeight() <= 0) {
      logOutgoingTransitionSkipped("layout_not_ready");
      return;
    }
    startOutgoingLocalToPipTransition(reason);
  }

  private void startOutgoingLocalToPipTransition(String reason) {
    outgoingTransitionRunning = true;
    final int generation = ++outgoingTransitionGeneration;
    remoteContainer.setVisibility(View.VISIBLE);
    remoteContainer.setAlpha(1f);
    localContainer.setVisibility(View.VISIBLE);
    localContainer.setAlpha(1f);
    localContainer.setEnabled(false);
    localContainer.bringToFront();
    activeActions.bringToFront();
    if (connectedChromeOverlay != null) connectedChromeOverlay.bringToFront();

    final int startLeft = localContainer.getLeft();
    final int startTop = localContainer.getTop();
    final int startWidth = localContainer.getWidth() > 0 ? localContainer.getWidth() : videoRoot.getWidth();
    final int startHeight = localContainer.getHeight() > 0 ? localContainer.getHeight() : videoRoot.getHeight();
    logOutgoingPipParentBounds("transition_prepare");
    logOutgoingPipInsetsResolved("transition_prepare");
    final int[] end = resolveConnectedLocalPipRect("transition_target");
    lockedOutgoingPipTargetRect = new int[] {end[0], end[1], end[2], end[3]};
    logOutgoingPipTargetResolved(end, localPipCustomPosition ? "saved_drag" : "default");
    NativeVideoCallLog.info(
        "outgoing_local_to_pip_transition_started",
        callId,
        buildOutgoingVideoLogDetails(
            "reason="
                + reason
                + " start="
                + startLeft
                + ","
                + startTop
                + ","
                + startWidth
                + "x"
                + startHeight
                + " end="
                + end[0]
                + ","
                + end[1]
                + ","
                + end[2]
                + "x"
                + end[3]));
    outgoingLocalToPipAnimator = ValueAnimator.ofFloat(0f, 1f);
    outgoingLocalToPipAnimator.setDuration(320L);
    outgoingLocalToPipAnimator.setInterpolator(new DecelerateInterpolator(1.6f));
    outgoingLocalToPipAnimator.addUpdateListener(
        animator -> {
          float t = (float) animator.getAnimatedValue();
          int left = Math.round(startLeft + (end[0] - startLeft) * t);
          int top = Math.round(startTop + (end[1] - startTop) * t);
          int width = Math.round(startWidth + (end[2] - startWidth) * t);
          int height = Math.round(startHeight + (end[3] - startHeight) * t);
          setLocalContainerBounds(left, top, width, height);
        });
    outgoingLocalToPipAnimator.addListener(
        new android.animation.AnimatorListenerAdapter() {
          @Override
          public void onAnimationEnd(android.animation.Animator animation) {
            if (generation != outgoingTransitionGeneration || isTerminalState(currentState)) return;
            outgoingTransitionRunning = false;
            outgoingTransitionCompleted = true;
            outgoingLocalToPipAnimator = null;
            localPipLeft = end[0];
            localPipTop = end[1];
            localContainer.setEnabled(true);
            setLocalContainerBounds(end[0], end[1], end[2], end[3]);
            localContainer.setTranslationX(0f);
            localContainer.setTranslationY(0f);
            localContainer.setScaleX(1f);
            localContainer.setScaleY(1f);
            int[] measured = measureLocalContainerBounds();
            logOutgoingPipFinalFrameMeasured(end, measured, "transition_completed");
            NativeVideoCallLog.info(
                "outgoing_local_to_pip_transition_completed",
                callId,
                buildOutgoingVideoLogDetails(
                    "reason="
                        + reason
                        + " finalX="
                        + measured[0]
                        + " finalY="
                        + measured[1]
                        + " finalWidth="
                        + measured[2]
                        + " finalHeight="
                        + measured[3]
                        + " targetDeltaPx="
                        + pipRectDelta(end, measured)));
            NativeVideoCallLog.info(
                "outgoing_video_connected_ui_ready",
                callId,
                buildOutgoingVideoLogDetails("reason=transition_completed"));
            localContainer.post(
                () -> {
                  if (generation != outgoingTransitionGeneration || isTerminalState(currentState)) return;
                  int[] layoutPassMeasured = measureLocalContainerBounds();
                  verifyPipPositionAfterLayout("transition_completed_layout_pass", lockedOutgoingPipTargetRect);
                  logOutgoingPipFinalFrameMeasured(
                      lockedOutgoingPipTargetRect, layoutPassMeasured, "transition_completed_layout_pass");
                });
            applyState(currentState);
          }

          @Override
          public void onAnimationCancel(android.animation.Animator animation) {
            outgoingTransitionRunning = false;
            outgoingLocalToPipAnimator = null;
            if (currentState == NativeVideoCallRuntime.State.CONNECTED) {
              outgoingTransitionCompleted = true;
            }
            NativeVideoCallLog.info(
                "outgoing_video_transition_cancelled",
                callId,
                buildOutgoingVideoLogDetails("reason=animator_cancel"));
          }
        });
    outgoingLocalToPipAnimator.start();
  }

  private void cancelOutgoingVideoTransition(String reason) {
    outgoingTransitionGeneration++;
    if (outgoingLocalToPipAnimator != null) {
      outgoingLocalToPipAnimator.cancel();
      outgoingLocalToPipAnimator = null;
    }
    if (outgoingTransitionRunning) {
      NativeVideoCallLog.info(
          "outgoing_video_transition_cancelled",
          callId != null ? callId : "unknown",
          buildOutgoingVideoLogDetails("reason=" + reason));
    }
    outgoingTransitionRunning = false;
    lockedOutgoingPipTargetRect = null;
  }

  private void logOutgoingTransitionSkipped(String reason) {
    NativeVideoCallLog.info(
        "outgoing_local_to_pip_transition_skipped",
        callId != null ? callId : "unknown",
        buildOutgoingVideoLogDetails("reason=" + reason));
  }

  private void applyOutgoingLocalFullscreenLayout() {
    if (localContainer == null || videoRoot == null) return;
    FrameLayout.LayoutParams params =
        new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
    params.gravity = Gravity.TOP | Gravity.START;
    params.setMargins(0, 0, 0, 0);
    localContainer.setLayoutParams(params);
    localContainer.setTranslationX(0f);
    localContainer.setTranslationY(0f);
    localContainer.setScaleX(1f);
    localContainer.setScaleY(1f);
  }

  /** SSOT: connected 보조 PiP frame (parent-local). transition·final layout·기본 배치 공통. */
  private int[] resolveConnectedLocalPipRect(String positionSource) {
    int width = dp(LOCAL_PIP_WIDTH_DP);
    int height = dp(LOCAL_PIP_HEIGHT_DP);
    int margin = dp(LOCAL_PIP_MARGIN_DP);
    int left;
    int top;
    if (localPipCustomPosition) {
      logOutgoingPipSavedPositionResolved(localPipLeft, localPipTop);
      int[] clamped = clampLocalPipPosition(localPipLeft, localPipTop);
      left = clamped[0];
      top = clamped[1];
    } else {
      int[] bounds = getLocalPipUsableBounds();
      if (bounds == null) {
        left = margin;
        top = margin;
      } else {
        left = bounds[0] + margin;
        top = bounds[3] - height - margin;
        int[] clamped = clampLocalPipPosition(left, top);
        left = clamped[0];
        top = clamped[1];
      }
    }
    return new int[] {left, top, width, height};
  }

  private void applyConnectedLocalPipLayout(String reason) {
    if (localContainer == null || shouldSkipConnectedPipLayout()) return;
    pipLayoutPassCount++;
    int[] rect = resolveConnectedLocalPipRect(reason);
    localPipLeft = rect[0];
    localPipTop = rect[1];
    setLocalContainerBounds(rect[0], rect[1], rect[2], rect[3]);
    localContainer.setTranslationX(0f);
    localContainer.setTranslationY(0f);
    localContainer.setScaleX(1f);
    localContainer.setScaleY(1f);
    NativeVideoCallLog.info(
        "outgoing_pip_layout_reapplied",
        callId,
        buildOutgoingPipLayoutDetails(
            reason,
            rect,
            measureLocalContainerBounds(),
            localPipCustomPosition ? "saved_drag" : "default"));
    if (outgoingTransitionCompleted && lockedOutgoingPipTargetRect != null) {
      verifyPipPositionAfterLayout(reason, lockedOutgoingPipTargetRect);
    }
  }

  private int[] measureLocalContainerBounds() {
    if (localContainer == null) return new int[] {0, 0, 0, 0};
    return new int[] {
      localContainer.getLeft(),
      localContainer.getTop(),
      localContainer.getWidth(),
      localContainer.getHeight()
    };
  }

  private int pipRectDelta(int[] expected, int[] actual) {
    if (expected == null || actual == null) return -1;
    return Math.abs(actual[0] - expected[0])
        + Math.abs(actual[1] - expected[1])
        + Math.abs(actual[2] - expected[2])
        + Math.abs(actual[3] - expected[3]);
  }

  private void verifyPipPositionAfterLayout(String reason, int[] expected) {
    if (expected == null || localContainer == null) return;
    int[] measured = measureLocalContainerBounds();
    int delta = pipRectDelta(expected, measured);
    if (delta > 1) {
      NativeVideoCallLog.info(
          "outgoing_pip_unexpected_position_change",
          callId,
          buildOutgoingPipLayoutDetails(reason, expected, measured, "unexpected"));
    }
  }

  private void logOutgoingPipParentBounds(String reason) {
    int parentWidth = videoRoot != null ? videoRoot.getWidth() : 0;
    int parentHeight = videoRoot != null ? videoRoot.getHeight() : 0;
    NativeVideoCallLog.info(
        "outgoing_pip_parent_bounds",
        callId,
        buildOutgoingVideoLogDetails(
            "reason="
                + reason
                + " orientation="
                + getResources().getConfiguration().orientation
                + " parentX=0 parentY=0 parentWidth="
                + parentWidth
                + " parentHeight="
                + parentHeight
                + " layoutPassCount="
                + pipLayoutPassCount));
  }

  private void logOutgoingPipInsetsResolved(String reason) {
    NativeVideoCallLog.info(
        "outgoing_pip_insets_resolved",
        callId,
        buildOutgoingVideoLogDetails(
            "reason="
                + reason
                + " safeLeft="
                + systemBarsLeft
                + " safeTop="
                + systemBarsTop
                + " safeRight="
                + systemBarsRight
                + " safeBottom="
                + systemBarsBottom));
  }

  private void logOutgoingPipSavedPositionResolved(int left, int top) {
    NativeVideoCallLog.info(
        "outgoing_pip_saved_position_resolved",
        callId,
        buildOutgoingVideoLogDetails(
            "savedLeft=" + left + " savedTop=" + top + " savedPositionUsed=true positionSource=saved_drag"));
  }

  private void logOutgoingPipTargetResolved(int[] rect, String positionSource) {
    NativeVideoCallLog.info(
        "outgoing_pip_target_resolved",
        callId,
        buildOutgoingPipLayoutDetails("transition_target", rect, rect, positionSource));
  }

  private void logOutgoingPipFinalFrameMeasured(int[] target, int[] measured, String reason) {
    NativeVideoCallLog.info(
        "outgoing_pip_final_frame_measured",
        callId,
        buildOutgoingPipLayoutDetails(reason, target, measured, "measured"));
  }

  private String buildOutgoingPipLayoutDetails(
      String reason, int[] target, int[] measured, String positionSource) {
    int delta = pipRectDelta(target, measured);
    return buildOutgoingVideoLogDetails(
        "reason="
            + reason
            + " orientation="
            + getResources().getConfiguration().orientation
            + " parentWidth="
            + (videoRoot != null ? videoRoot.getWidth() : 0)
            + " parentHeight="
            + (videoRoot != null ? videoRoot.getHeight() : 0)
            + " safeTop="
            + systemBarsTop
            + " safeBottom="
            + systemBarsBottom
            + " safeLeft="
            + systemBarsLeft
            + " safeRight="
            + systemBarsRight
            + " pipWidth="
            + (target != null ? target[2] : 0)
            + " pipHeight="
            + (target != null ? target[3] : 0)
            + " targetX="
            + (target != null ? target[0] : 0)
            + " targetY="
            + (target != null ? target[1] : 0)
            + " finalX="
            + (measured != null ? measured[0] : 0)
            + " finalY="
            + (measured != null ? measured[1] : 0)
            + " finalWidth="
            + (measured != null ? measured[2] : 0)
            + " finalHeight="
            + (measured != null ? measured[3] : 0)
            + " deltaX="
            + (target != null && measured != null ? Math.abs(measured[0] - target[0]) : 0)
            + " deltaY="
            + (target != null && measured != null ? Math.abs(measured[1] - target[1]) : 0)
            + " deltaWidth="
            + (target != null && measured != null ? Math.abs(measured[2] - target[2]) : 0)
            + " deltaHeight="
            + (target != null && measured != null ? Math.abs(measured[3] - target[3]) : 0)
            + " targetDeltaPx="
            + delta
            + " savedPositionUsed="
            + localPipCustomPosition
            + " positionSource="
            + positionSource
            + " layoutPassCount="
            + pipLayoutPassCount
            + " transitionCompleted="
            + outgoingTransitionCompleted);
  }

  private void setLocalContainerBounds(int left, int top, int width, int height) {
    if (localContainer == null) return;
    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(width, height);
    params.gravity = Gravity.TOP | Gravity.START;
    params.setMargins(left, top, 0, 0);
    localContainer.setLayoutParams(params);
  }

  private String buildOutgoingVideoLogDetails(String extra) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    return "platform=android"
        + " initiator="
        + (session != null && session.initiator)
        + " uiMode="
        + uiMode
        + " runtimeState="
        + currentState
        + " localFrameReady="
        + outgoingLocalFirstFrameReady
        + " remoteFrameReady="
        + outgoingRemoteFirstFrameReady
        + " transitionRunning="
        + outgoingTransitionRunning
        + " transitionCompleted="
        + outgoingTransitionCompleted
        + " localAttached="
        + localSurfaceChildCount()
        + " remoteAttached="
        + remoteSurfaceChildCount()
        + (extra != null && !extra.isEmpty() ? " " + extra : "");
  }

  private void attachBackgroundChromeTapListener() {
    if (videoRoot == null) return;
    videoRoot.setOnTouchListener(
        (view, event) -> {
          if (!isConnectedFullscreenPresentation()) return false;
          switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
              backgroundTapTracking = true;
              backgroundTapMoved = false;
              backgroundTapStartX = event.getRawX();
              backgroundTapStartY = event.getRawY();
              return true;
            case MotionEvent.ACTION_MOVE:
              if (!backgroundTapTracking) return false;
              float dx = Math.abs(event.getRawX() - backgroundTapStartX);
              float dy = Math.abs(event.getRawY() - backgroundTapStartY);
              if (dx > backgroundTapSlop || dy > backgroundTapSlop) {
                backgroundTapMoved = true;
              }
              return true;
            case MotionEvent.ACTION_UP:
              if (backgroundTapTracking && !backgroundTapMoved) {
                showConnectedChrome("background_tap");
              }
              backgroundTapTracking = false;
              return true;
            case MotionEvent.ACTION_CANCEL:
              backgroundTapTracking = false;
              return true;
            default:
              return false;
          }
        });
  }

  private boolean isConnectedFullscreenPresentation() {
    return currentState == NativeVideoCallRuntime.State.CONNECTED
        && !inPipMode
        && !dockMode
        && !isFinishing();
  }

  /**
   * 연결·전체 화면 버튼(오른쪽 4개·라벨·줄이기) 보이기 + 5초 뒤 숨김 예약.
   *
   * <p>상단 이름·통화 시간·신호(connectedChromeOverlay)는 이 표시와 무관하게 항상 보인다 — {@link
   * #syncPersistentCallStatusVisibility()}. 설계: docs/audit/call-video-chrome-signal-border-design-2026-11-12.md D1·D2.
   */
  private void showConnectedChrome(String source) {
    cancelConnectedChromeHide("show_" + source);
    boolean wasVisible = chromeVisible;
    chromeVisible = true;
    setConnectedChromeViewsVisible(true);
    if (!wasVisible) {
      NativeVideoCallLog.info(
          "native_video_chrome_shown",
          callId,
          "source="
              + source
              + " connected="
              + (currentState == NativeVideoCallRuntime.State.CONNECTED)
              + " presentation=fullscreen"
              + " nicknameSource=session_callerName_sanitized");
    }
    scheduleConnectedChromeHide(source);
  }

  private void hideConnectedChrome(String source) {
    cancelConnectedChromeHide("hide_" + source);
    if (!isConnectedFullscreenPresentation()) return;
    if (!chromeVisible) return;
    if (connectedChromeAutoHideBlocked()) return;
    chromeVisible = false;
    applyConnectedChromeHidden(true);
    NativeVideoCallLog.info(
        "native_video_chrome_hidden",
        callId,
        "source=" + source + " connected=true presentation=fullscreen delayMs=" + CONNECTED_CHROME_HIDE_DELAY_MS);
  }

  /** 숨김 상태 적용 — 버튼 묶음·줄이기만. 상단 정보는 그대로. */
  private void applyConnectedChromeHidden(boolean fade) {
    fadeOutChromeView(activeActions, fade);
    fadeOutChromeView(topBar, fade);
    syncPersistentCallStatusVisibility();
  }

  private void fadeOutChromeView(View view, boolean fade) {
    if (view == null) return;
    view.animate().cancel();
    view.setEnabled(false);
    if (!fade || view.getVisibility() != View.VISIBLE) {
      view.setAlpha(1f);
      view.setVisibility(View.GONE);
      return;
    }
    view.animate()
        .alpha(0f)
        .setDuration(CONNECTED_CHROME_FADE_MS)
        .withEndAction(
            () -> {
              if (chromeVisible) return;
              view.setVisibility(View.GONE);
              view.setAlpha(1f);
            })
        .start();
  }

  /**
   * 숨김 중(또는 사라지는 0.2초 동안) 버튼 터치 = 버튼을 보이게만 하고 동작하지 않는다(실수 종료 방지). 숨김이 아니면 false.
   */
  private boolean consumeTapWhileChromeHidden(String button) {
    if (chromeVisible || !isConnectedFullscreenPresentation()) return false;
    showConnectedChrome("tap_while_hidden_" + button);
    return true;
  }

  /** 아주 나쁨 동안·TalkBack(터치 탐색) 켜짐 동안은 숨기지 않는다. */
  private boolean connectedChromeAutoHideBlocked() {
    if (networkVeryPoorActive) return true;
    AccessibilityManager am = (AccessibilityManager) getSystemService(ACCESSIBILITY_SERVICE);
    return am != null && am.isEnabled() && am.isTouchExplorationEnabled();
  }

  private void setConnectedChromeViewsVisible(boolean visible) {
    if (!visible) {
      applyConnectedChromeHidden(false);
      return;
    }
    if (activeActions != null) {
      activeActions.animate().cancel();
      activeActions.setAlpha(1f);
      activeActions.setEnabled(true);
      activeActions.setVisibility(View.VISIBLE);
    }
    if (connectedControls != null) {
      connectedControls.setAlpha(1f);
      connectedControls.setEnabled(true);
      connectedControls.setVisibility(View.VISIBLE);
    }
    if (topBar != null) {
      topBar.animate().cancel();
      topBar.setAlpha(1f);
      topBar.setEnabled(true);
    }
    syncPersistentCallStatusVisibility();
  }

  /**
   * 상단 이름·통화 시간·신호 = 연결·전체 화면에서 항상 보임(버튼 자동 숨김과 독립). 신호 테두리도 같은 조건. 버튼 묶음은 여기서
   * 보이게 하지 않는다 — 표시 여부는 chromeVisible(show/hideConnectedChrome)만 정한다.
   */
  private void syncPersistentCallStatusVisibility() {
    boolean show =
        currentState == NativeVideoCallRuntime.State.CONNECTED && !inPipMode && !dockMode && !isFinishing();
    if (signalEdgeView != null) {
      signalEdgeView.setTier(networkTier.displayed(), false);
      signalEdgeView.setActive(show && !preparing);
    }
    if (connectedChromeOverlay == null) return;
    connectedChromeOverlay.setVisibility(show ? View.VISIBLE : View.GONE);
    syncMinimizeButton();
    if (show) {
      connectedChromeOverlay.bringToFront();
      connectedChromeOverlay.setTranslationZ(20f);
      if (activeActions != null) {
        activeActions.bringToFront();
        activeActions.setTranslationZ(32f);
      }
    }
  }

  private void scheduleConnectedChromeHide(String source) {
    mainHandler.removeCallbacks(chromeHideRunnable);
    if (!isConnectedFullscreenPresentation()) return;
    if (connectedChromeAutoHideBlocked()) return;
    mainHandler.postDelayed(chromeHideRunnable, CONNECTED_CHROME_HIDE_DELAY_MS);
  }

  private void cancelConnectedChromeHide(String reason) {
    mainHandler.removeCallbacks(chromeHideRunnable);
  }

  private void updateConnectedControlChrome() {
    if (cameraButton != null) {
      cameraButton.setImageResource(cameraEnabled ? R.drawable.ic_call_video : R.drawable.ic_call_video_off);
      cameraButton.setContentDescription(
          getString(cameraEnabled ? R.string.dibay_video_camera_on : R.string.dibay_video_camera_off));
      cameraButton.setBackgroundResource(R.drawable.bg_call_control_neutral);
      cameraButton.setColorFilter(Color.WHITE);
    }
    if (micButton != null) {
      micButton.setImageResource(micMuted ? R.drawable.ic_call_mic_off : R.drawable.ic_call_mic_on);
      micButton.setContentDescription(
          getString(micMuted ? R.string.dibay_call_control_unmute : R.string.dibay_call_control_mute));
      micButton.setBackgroundResource(R.drawable.bg_call_control_neutral);
      micButton.setColorFilter(Color.WHITE);
    }
    if (micLabelView != null) {
      micLabelView.setText(micMuted ? R.string.dibay_call_control_unmute : R.string.dibay_call_control_mute);
    }
    if (cameraFlipButton != null) {
      cameraFlipButton.setBackgroundResource(R.drawable.bg_call_control_neutral);
      cameraFlipButton.setColorFilter(Color.WHITE);
    }
    if (endButton != null) {
      endButton.setBackgroundResource(R.drawable.bg_call_control_danger);
      endButton.setColorFilter(Color.WHITE);
    }
    refreshPipParams("controls");
  }

  /** 통화 화면 카메라 버튼·PiP 카메라 버튼 공통 (SSOT §3 — 같은 함수). */
  private void onCameraTapped(String source) {
    cameraEnabled = !cameraEnabled;
    NativeVideoCallAgoraEngine.setCameraEnabled(cameraEnabled);
    NativeVideoCallLog.info("native_video_camera_changed", callId, "source=" + source + " enabled=" + cameraEnabled);
    updateConnectedControlChrome();
    if (!inPipMode) showConnectedChrome("video_toggle");
  }

  /** 통화 화면 마이크 버튼·PiP 마이크 버튼 공통 (SSOT §3 — 같은 함수). */
  private void onMicTapped(String source) {
    micMuted = !micMuted;
    boolean applied = NativeVideoCallAgoraEngine.setMicMuted(micMuted);
    if (!applied) {
      micMuted = !micMuted;
    }
    updateConnectedControlChrome();
    NativeVideoCallLog.info(
        "native_video_mic_muted_changed",
        callId,
        "source="
            + source
            + " connected="
            + (currentState == NativeVideoCallRuntime.State.CONNECTED)
            + " presentation="
            + (inPipMode ? "pip" : "fullscreen")
            + " requestedMuted="
            + micMuted
            + " result="
            + applied);
    if (!inPipMode) showConnectedChrome("mic_toggle");
  }

  /**
   * SSOT §3 — PiP 마이크·카메라 버튼. 통화 화면 버튼과 같은 함수를 부른다. 화면이 없으면(드문 경합) 아무것도 바꾸지
   * 않고 기록만 한다(통화 상태 불변).
   */
  public static void onPipAction(Context context, String callId, String action) {
    if (callId == null || action == null) return;
    Handler main = new Handler(Looper.getMainLooper());
    main.post(
        () -> {
          NativeVideoCallActivity activity = activeRef.get();
          if (activity == null
              || activity.isFinishing()
              || activity.isDestroyed()
              || !callId.equals(activity.callId)) {
            NativeVideoCallLog.info("native_video_pip_action_ignored", callId, "action=" + action + " reason=no_surface");
            return;
          }
          if (NativeVideoCallActionReceiver.ACTION_PIP_MIC.equals(action)) {
            activity.onMicTapped("pip");
          } else if (NativeVideoCallActionReceiver.ACTION_PIP_CAMERA.equals(action)) {
            activity.onCameraTapped("pip");
          }
        });
  }

  private boolean isAutoPipEligible() {
    return !preparing
        && callId != null
        && !callId.isEmpty()
        && currentState == NativeVideoCallRuntime.State.CONNECTED
        && !isFinishing();
  }

  private int maxPipActions() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return 0;
    try {
      return getMaxNumPictureInPictureActions();
    } catch (RuntimeException error) {
      return 3;
    }
  }

  private PictureInPictureParams buildPipParams(boolean autoEnter) {
    return NativeVideoCallPipPresenter.buildParams(
        this, callId, micMuted, cameraEnabled, autoEnter, maxPipActions());
  }

  /**
   * SSOT §4-1 — CONNECTED 동안만 자동 PiP(홈·최근 앱·제스처), 버튼 상태(마이크·카메라)가 바뀌면 PiP 버튼 갱신. 키가 같으면
   * 다시 넘기지 않는다(깜박임 방지).
   */
  private void refreshPipParams(String reason) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    if (callId == null || callId.isEmpty() || preparing) return;
    boolean autoEnter = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && isAutoPipEligible();
    // callId 포함 — 같은 화면이 새 통화로 다시 쓰여도(onNewIntent) PiP 버튼이 이전 callId 를 들고 있지 않게.
    String key =
        callId
            + "|"
            + CallPipActionPlan.stateKey(
                CallPipActionPlan.plan(true, cameraEnabled, maxPipActions()), micMuted, cameraEnabled, autoEnter);
    if (key.equals(lastPipParamsKey)) return;
    PictureInPictureParams params = buildPipParams(autoEnter);
    if (params == null) return;
    try {
      setPictureInPictureParams(params);
      lastPipParamsKey = key;
      NativeVideoCallLog.info("native_video_pip_params_set", callId, "reason=" + reason + " autoEnter=" + autoEnter);
    } catch (RuntimeException error) {
      NativeVideoCallLog.warn(
          "native_video_pip_params_failed", callId, "err=" + error.getClass().getSimpleName());
    }
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

  /**
   * S2 §12.3 — 뒤로·줄이기 버튼 (CONNECTED): 기존 minimizeConnectedCall(PiP → 실패 시 Dock) 을 그대로 호출한 뒤
   * 앱(메신저)을 앞으로. PiP 면 PiP 창이 뜬 뒤, Dock 이면 바로. 통화 종료 없음.
   */
  private boolean minimizeToApp(String source) {
    // 원인·설계: docs/audit/call-back-app-return-root-cause-2026-11-12.md §7
    // PiP 를 먼저 요청하면 앱 프로세스가 「고정」으로 판정돼 메신저를 못 올리고(§1),
    // moveToFront 는 TO_FRONT 라 PiP2 가 자동 PiP 를 안 한다(§2·§3). 그래서 고정 전에 메신저를 startActivity(OPEN)로 연다.
    if (canOpenAppForAutoPip() && openAppThenAutoPip(source)) return true;
    if (!minimizeConnectedCall(source)) return false;
    boolean pipPath =
        inPipMode || pipState == PipState.PIP_REQUESTED || pipState == PipState.PIP_ACTIVE;
    if (pipPath) {
      if (inPipMode || pipState == PipState.PIP_ACTIVE) {
        NativeCallAppReturn.bringAppToFront(this, callId, source);
        return true;
      }
      // 복귀 요청은 PiP 요청이 수락된 지금(통화 화면이 아직 보이고 고정되기 전) 보낸다.
      // PiP 가 뜬 뒤에 보내면 Android 가 「보이는 화면이 PiP 뿐」이라 막는다(BAL_BLOCK).
      // docs/audit/call-back-app-return-bal-design-2026-11-12.md §2·§5
      requestAppReturnBeforePinned(source);
      return true;
    }
    NativeCallAppReturn.bringAppToFront(this, callId, source);
    return true;
  }

  /** PiP 요청 수락 직후 메신저 복귀 요청 + PiP 콜백·보조 타이머는 확인 전용으로 대기. */
  private void requestAppReturnBeforePinned(String source) {
    appReturnRequestedAtMs = SystemClock.elapsedRealtime();
    NativeCallAppReturn.bringAppToFront(this, callId, source);
    pendingAppReturnSource = source;
    mainHandler.removeCallbacks(appReturnAfterPipFallback);
    mainHandler.postDelayed(appReturnAfterPipFallback, APP_RETURN_AFTER_PIP_FALLBACK_MS);
  }

  private boolean canOpenAppForAutoPip() {
    return !inPipMode
        && !dockMode
        && isAutoPipEligible()
        && NativeCallAppReturn.openAppAutoPipSupported(this);
  }

  /** §7 — 고정 전에 메신저를 startActivity(OPEN)로 열고 PiP 는 시스템 자동 PiP 에 맡긴다. 1.5초 안에 PiP 가 없으면 기록만. */
  private boolean openAppThenAutoPip(String source) {
    lastPipParamsKey = null; // 자동 PiP 켜짐을 확실히 다시 넘긴다
    refreshPipParams("app_return_open");
    appReturnRequestedAtMs = SystemClock.elapsedRealtime();
    skipUserLeavePipUntilMs = appReturnRequestedAtMs + SKIP_USER_LEAVE_WINDOW_MS;
    autoPipPendingSource = source;
    NativeVideoCallLog.info("native_video_app_return_open", callId, "source=" + source);
    if (!NativeCallAppReturn.openAppForAutoPip(this, callId, source)) {
      skipUserLeavePipUntilMs = 0L;
      autoPipPendingSource = null;
      return false;
    }
    mainHandler.removeCallbacks(autoPipMissedCheck);
    mainHandler.postDelayed(autoPipMissedCheck, AUTO_PIP_CHECK_MS);
    return true;
  }

  /** PiP 콜백·보조 타이머: 메신저가 이미 앞으로 왔으면 아무것도 안 하고, 아니면 1회 재시도(결과는 확인 로그). */
  private void confirmOrRetryAppReturn(String source, String trigger) {
    if (NativeCallAppReturn.isConfirmedSince(callId, appReturnRequestedAtMs)) {
      NativeVideoCallLog.info(
          "native_video_app_return_already_front", callId, "source=" + source + " trigger=" + trigger);
      return;
    }
    NativeCallAppReturn.bringAppToFront(this, callId, source + ":retry_" + trigger);
  }

  /** 줄이기 버튼 — 연결 후 전체화면(PiP·Dock 아님)에서만. */
  private void syncMinimizeButton() {
    if (minimizeButton == null) return;
    boolean fullscreenConnected =
        !preparing
            && currentState == NativeVideoCallRuntime.State.CONNECTED
            && !inPipMode
            && !dockMode
            && !isFinishing();
    if (fullscreenConnected && !chromeVisible) {
      // 버튼 자동 숨김 중(D1) — 줄이기는 버튼 묶음과 함께 hideConnectedChrome 의 페이드로 사라진다. 여기서 건드리지 않는다.
      return;
    }
    minimizeButton.setVisibility(fullscreenConnected ? View.VISIBLE : View.GONE);
    if (topBar != null) {
      topBar.animate().cancel();
      topBar.setAlpha(1f);
      topBar.setVisibility(fullscreenConnected ? View.VISIBLE : View.GONE);
    }
  }

  /** 첫 연결 시각을 callId 별로 기억 — 화면을 다시 만들어도 시간이 이어진다. */
  private void ensureConnectedAt() {
    if (connectedAtElapsedMs > 0L) return;
    Long saved = callId != null ? CONNECTED_AT_BY_CALL.get(callId) : null;
    connectedAtElapsedMs = saved != null ? saved : SystemClock.elapsedRealtime();
    if (callId != null) CONNECTED_AT_BY_CALL.put(callId, connectedAtElapsedMs);
  }

  private boolean tryEnterPip(String source) {
    lastPipSource = source != null ? source : "";
    NativeVideoCallLog.info("native_video_pip_request", callId, buildPipLogDetails(lastPipSource));
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      NativeVideoCallLog.info(
          "native_video_pip_request_rejected", callId, buildPipLogDetails(lastPipSource) + " reason=api_below_26");
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
    PictureInPictureParams params = buildPipParams(Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && isAutoPipEligible());
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

  private boolean suppressOutgoingTransitionRestart = false;

  /** CONNECTED PiP/dock/알림 복귀 — 발신 전환 플래그 + 보조 PiP SSOT + 녹색 오버레이 제거. */
  private void restoreConnectedFullscreenVideoLayout(String reason) {
    if (currentState != NativeVideoCallRuntime.State.CONNECTED) return;
    suppressOutgoingTransitionRestart = true;
    try {
      syncOutgoingFlagsForConnectedLayoutRestore();
      refreshConnectedVideoShellAfterRestore(reason);
    } finally {
      suppressOutgoingTransitionRestart = false;
    }
  }

  /** applyState 직후 CONNECTED 영상 셸 강제 복원(녹색 bg_dibay_incoming_fullscreen 잔류 방지). */
  private void refreshConnectedVideoShellAfterRestore(String reason) {
    if (videoRoot != null) videoRoot.setVisibility(View.VISIBLE);
    if (overlayRoot != null) {
      overlayRoot.setVisibility(View.VISIBLE);
      overlayRoot.setBackgroundColor(Color.TRANSPARENT);
    }
    if (statusPanel != null) statusPanel.setVisibility(View.GONE);
    if (remoteContainer != null) {
      remoteContainer.setVisibility(View.VISIBLE);
      remoteContainer.setAlpha(1f);
    }
    if (localContainer != null) {
      localContainer.setVisibility(View.VISIBLE);
      localContainer.setAlpha(1f);
    }
    ensureVideoRootForRemoteRender();
    if (!shouldSkipConnectedPipLayout()) {
      applyConnectedLocalPipLayout(reason);
    }
    NativeVideoCallAgoraEngine.onRemoteRenderSurfaceReady(callId);
    NativeVideoCallLog.info(
        "native_video_connected_shell_restored",
        callId,
        "reason=" + reason
            + " localAttached="
            + localSurfaceChildCount()
            + " remoteAttached="
            + remoteSurfaceChildCount());
  }

  private void syncOutgoingFlagsForConnectedLayoutRestore() {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (!isOutgoingVideoPresentation(session)) return;
    if (outgoingLocalToPipAnimator != null) {
      outgoingLocalToPipAnimator.cancel();
      outgoingLocalToPipAnimator = null;
    }
    outgoingTransitionRunning = false;
    outgoingTransitionCompleted = true;
    outgoingLocalFirstFrameReady = true;
    outgoingRemoteFirstFrameReady = true;
  }

  private void applyPipUiMode(boolean enabled) {
    if (enabled) {
      cancelConnectedChromeHide("pip_enter");
      wasConnectedFullscreen = false;
    }
    if (enabled && dockMode) hideDock("pip_enter");
    if (overlayRoot != null) overlayRoot.setVisibility(enabled ? View.GONE : View.VISIBLE);
    if (activeActions != null) activeActions.setVisibility(enabled ? View.GONE : View.VISIBLE);
    if (localContainer != null) localContainer.setVisibility(enabled ? View.GONE : View.VISIBLE);
    if (dockRoot != null) dockRoot.setVisibility(enabled || !dockMode ? View.GONE : View.VISIBLE);
    syncPersistentCallStatusVisibility();
    if (!enabled && currentState != null) {
      if (currentState == NativeVideoCallRuntime.State.CONNECTED) {
        wasConnectedFullscreen = true;
        syncOutgoingFlagsForConnectedLayoutRestore();
      }
      applyState(currentState);
      if (currentState == NativeVideoCallRuntime.State.CONNECTED) {
        restoreConnectedFullscreenVideoLayout("pip_restore");
      }
      if (isConnectedFullscreenPresentation()) {
        showConnectedChrome("pip_restore");
      }
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
    cancelConnectedChromeHide("dock_enter");
    wasConnectedFullscreen = false;
    dockMode = true;
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
    if (currentState != null) {
      if (currentState == NativeVideoCallRuntime.State.CONNECTED) {
        wasConnectedFullscreen = true;
        syncOutgoingFlagsForConnectedLayoutRestore();
      }
      applyState(currentState);
      if (currentState == NativeVideoCallRuntime.State.CONNECTED) {
        restoreConnectedFullscreenVideoLayout("dock_restore");
      }
      if (isConnectedFullscreenPresentation()) {
        showConnectedChrome("dock_restore");
      }
    }
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
    ensureConnectedAt();
    startDurationTimer();
  }

  private boolean ensureVideoRootForRemoteRender() {
    if (videoRoot == null || remoteContainer == null) return false;
    videoRoot.setVisibility(View.VISIBLE);
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (isOutgoingVideoPresentation(session) && !outgoingRemoteFirstFrameReady) {
      remoteContainer.setVisibility(View.INVISIBLE);
      remoteContainer.setAlpha(0f);
    } else {
      remoteContainer.setVisibility(View.VISIBLE);
      remoteContainer.setAlpha(1f);
    }
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
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (isOutgoingVideoPresentation(session) && (!outgoingTransitionCompleted || outgoingTransitionRunning)) {
      return false;
    }
    return currentState == NativeVideoCallRuntime.State.CONNECTED && !inPipMode && !dockMode;
  }

  private void updateDurationLabel() {
    if (connectedAtElapsedMs <= 0L) return;
    String label = formatConnectedDuration(connectedAtElapsedMs);
    if (durationView != null) durationView.setText(label);
    if (connectedDurationView != null) connectedDurationView.setText(label);
    if (dockMode && dockRoot != null) {
      NativeVideoCallDockPresenter.updateDuration(dockRoot, label);
    }
  }

  private static String formatConnectedDuration(long connectedAtElapsedMs) {
    if (connectedAtElapsedMs <= 0L) return "00:00";
    long elapsedSec = Math.max(0L, (SystemClock.elapsedRealtime() - connectedAtElapsedMs) / 1000L);
    long hours = elapsedSec / 3600L;
    long minutes = (elapsedSec % 3600L) / 60L;
    long seconds = elapsedSec % 60L;
    if (hours > 0L) {
      return String.format(Locale.getDefault(), "%d:%02d:%02d", hours, minutes, seconds);
    }
    return String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds);
  }

  private void updateConnectedInfoPanel(NativeVideoCallUiPresenter.Model model) {
    if (connectedPeerNameView == null) return;
    syncPersistentCallStatusVisibility();
    if (!model.showConnectedControls || !model.showVideoSurfaces) {
      return;
    }
    connectedPeerNameView.setText(model.peerName);
    updateDurationLabel();
    updateNetworkSignalUi();
  }

  private void handleNetworkQualitySample(int worstQuality, int txQuality, int rxQuality) {
    if (!isConnectedFullscreenPresentation() && !dockMode) return;
    NativeVideoNetworkTier.Tier previousTier = networkTier.displayed();
    boolean changed = networkTier.onSample(txQuality, rxQuality);
    applyNetworkTier(previousTier, changed, "agora_onNetworkQuality", "tx=" + txQuality + " rx=" + rxQuality);
  }

  /** Agora 연결 상태 4(재연결 중) = 아주 나쁨, 3(연결됨) = 품질 값 회복 규칙으로 복귀. 설계 D3. */
  private void handleAgoraConnectionState(int state, int reason) {
    if (currentState != NativeVideoCallRuntime.State.CONNECTED) return;
    NativeVideoNetworkTier.Tier previousTier = networkTier.displayed();
    boolean changed = networkTier.onConnectionState(state);
    applyNetworkTier(previousTier, changed, "agora_connection_state", "state=" + state + " reason=" + reason);
  }

  private void applyNetworkTier(
      NativeVideoNetworkTier.Tier previousTier, boolean changed, String source, String detail) {
    NativeVideoNetworkTier.Tier nextTier = networkTier.displayed();
    if (changed) {
      NativeVideoCallLog.info(
          "native_video_network_quality_changed",
          callId,
          "source="
              + source
              + " previousQuality="
              + previousTier.name()
              + " currentQuality="
              + nextTier.name()
              + " "
              + detail
              + " reconnecting="
              + networkTier.reconnecting()
              + " chromeVisible="
              + chromeVisible
              + " presentation="
              + (dockMode ? "dock" : inPipMode ? "pip" : "fullscreen"));
      updateNetworkSignalUi();
    }
    if (nextTier == NativeVideoNetworkTier.Tier.VERY_POOR) {
      if (previousTier != NativeVideoNetworkTier.Tier.VERY_POOR) showNetworkVeryPoorChrome();
    } else if (networkVeryPoorActive) {
      // 아주 나쁨에서 벗어남 — 버튼 자동 숨김을 다시 센다(D1).
      networkVeryPoorActive = false;
      if (chromeVisible) scheduleConnectedChromeHide("network_quality_recovered");
    }
  }

  private void showNetworkVeryPoorChrome() {
    if (networkVeryPoorActive) return;
    networkVeryPoorActive = true;
    boolean chromeWasVisible = chromeVisible;
    if (isConnectedFullscreenPresentation()) showConnectedChrome("network_quality_very_poor");
    NativeVideoCallLog.info(
        "native_video_network_quality_alert_shown",
        callId,
        "source=network_quality_very_poor previousQuality="
            + networkTier.displayed().name()
            + " currentQuality=VERY_POOR chromeWasVisible="
            + chromeWasVisible
            + " connected=true presentation=fullscreen");
  }

  /** 상단 신호 막대 3개·문구(색은 기존 값 유지) + 신호 테두리 색. 설계 D3·D5. */
  private void updateNetworkSignalUi() {
    NativeVideoNetworkTier.Tier tier = networkTier.displayed();
    if (signalEdgeView != null) signalEdgeView.setTier(tier, true);
    if (connectedSignalLabelView == null) return;
    int activeBars;
    int labelRes;
    int barColor;
    switch (tier) {
      case POOR:
        activeBars = 2;
        labelRes = R.string.dibay_video_network_quality_poor;
        barColor = Color.parseColor("#F5C26B");
        break;
      case VERY_POOR:
        activeBars = 1;
        labelRes = R.string.dibay_video_network_quality_very_poor;
        barColor = Color.parseColor("#F28B82");
        break;
      case GOOD:
      default:
        activeBars = 3;
        labelRes = R.string.dibay_video_network_quality_good;
        barColor = Color.parseColor("#D4E9E2");
        break;
    }
    connectedSignalLabelView.setText(getString(labelRes));
    connectedSignalLabelView.setTextColor(barColor);
    for (int i = 0; i < connectedSignalBars.length; i++) {
      View bar = connectedSignalBars[i];
      if (bar == null) continue;
      boolean on = i < activeBars;
      bar.setAlpha(on ? 1f : 0.28f);
      bar.setBackgroundColor(barColor);
    }
  }

  private void attachConnectedControlsInsetsListener() {
    FrameLayout root = findViewById(R.id.native_video_call_root);
    if (root == null || activeActions == null || connectedControls == null) return;
    ViewCompat.setOnApplyWindowInsetsListener(
        root,
        (view, insets) -> {
          applyConnectedControlsLayout(root, insets);
          return insets;
        });
    connectedControls.addOnLayoutChangeListener(
        (v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
          if (bottom == oldBottom) return;
          WindowInsetsCompat current = ViewCompat.getRootWindowInsets(root);
          if (current != null) applyConnectedControlsLayout(root, current);
        });
    ViewCompat.requestApplyInsets(root);
  }

  /**
   * WindowInsets usable bottom for connected controls.
   *
   * <p>controlsBottom = usableBottom - controlStackHeight - controlMargin
   */
  private void applyConnectedControlsLayout(FrameLayout root, WindowInsetsCompat insets) {
    if (activeActions == null || connectedControls == null) return;
    int parentHeight = root.getHeight();
    if (parentHeight <= 0) {
      root.post(() -> applyConnectedControlsLayout(root, insets));
      return;
    }

    Insets nav =
        insets.getInsets(
            WindowInsetsCompat.Type.navigationBars()
                | WindowInsetsCompat.Type.systemGestures()
                | WindowInsetsCompat.Type.displayCutout());
    int insetBottom = Math.max(nav.bottom, 0);
    int usableBottom = parentHeight - insetBottom;
    int controlMargin = dp(CONNECTED_CONTROLS_DESIGN_MARGIN_DP);
    int controlStackHeight = measureConnectedControlStackHeight();
    int controlsBottom = usableBottom - controlStackHeight - controlMargin;

    ViewGroup.LayoutParams raw = activeActions.getLayoutParams();
    if (!(raw instanceof FrameLayout.LayoutParams)) return;
    FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) raw;
    lp.gravity = Gravity.BOTTOM | Gravity.END;
    lp.bottomMargin = Math.max(0, parentHeight - (controlsBottom + controlStackHeight));
    activeActions.setLayoutParams(lp);
  }

  private int measureConnectedControlStackHeight() {
    if (connectedControls == null) return 0;
    int measured = connectedControls.getHeight();
    if (measured > 0) return measured;
    int buttonSize = getResources().getDimensionPixelSize(R.dimen.dibay_call_btn_size_default);
    int buttonGap = getResources().getDimensionPixelSize(R.dimen.dibay_call_btn_gap);
    return buttonSize * 4 + buttonGap * 3;
  }

  /**
   * 신호 테두리는 영상 영역 가장자리에 붙는다 — targetSdk 36 화면은 내비게이션 바 뒤까지 그리므로, 내비 바(아래·가로 화면 옆)만큼
   * 비켜 테두리가 내비 바에 가려지지 않게 한다. 상태 바 쪽은 영상이 그 아래까지 보이므로 비키지 않는다.
   */
  private void attachSignalEdgeInsetsListener() {
    if (signalEdgeView == null) return;
    ViewCompat.setOnApplyWindowInsetsListener(
        signalEdgeView,
        (view, insets) -> {
          Insets nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
          ViewGroup.LayoutParams lp = view.getLayoutParams();
          if (lp instanceof ViewGroup.MarginLayoutParams) {
            ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) lp;
            if (mlp.leftMargin != nav.left || mlp.rightMargin != nav.right || mlp.bottomMargin != nav.bottom) {
              mlp.setMargins(nav.left, 0, nav.right, nav.bottom);
              view.setLayoutParams(mlp);
            }
          }
          return insets;
        });
    ViewCompat.requestApplyInsets(signalEdgeView);
  }

  private void attachLocalPipInsetsListener() {
    if (videoRoot == null) return;
    ViewCompat.setOnApplyWindowInsetsListener(
        videoRoot,
        (view, insets) -> {
          Insets bars =
              insets.getInsets(
                  WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
          systemBarsLeft = bars.left;
          systemBarsTop = bars.top;
          systemBarsRight = bars.right;
          systemBarsBottom = bars.bottom;
          if (shouldSkipConnectedPipLayout()) {
            return insets;
          }
          if (!localPipCustomPosition) {
            applyConnectedLocalPipLayout("window_insets");
          } else {
            int[] clamped = clampLocalPipPosition(localPipLeft, localPipTop);
            localPipLeft = clamped[0];
            localPipTop = clamped[1];
            applyLocalPipPosition(false);
          }
          return insets;
        });
    ViewCompat.requestApplyInsets(videoRoot);
  }

  private void applyDefaultLocalPipPosition() {
    applyConnectedLocalPipLayout("default_position");
  }

  /** usableLeft, usableTop, usableRight, usableBottom or null when parent not laid out. */
  private int[] getLocalPipUsableBounds() {
    if (localContainer == null || !(localContainer.getParent() instanceof View)) return null;
    View parent = (View) localContainer.getParent();
    int parentWidth = parent.getWidth();
    int parentHeight = parent.getHeight();
    if (parentWidth <= 0 || parentHeight <= 0) return null;
    return new int[] {
      systemBarsLeft,
      systemBarsTop,
      parentWidth - systemBarsRight,
      parentHeight - systemBarsBottom
    };
  }

  private void applyLocalPreviewLayout() {
    if (localContainer == null || shouldSkipConnectedPipLayout()) return;
    if (localPipCustomPosition) {
      int[] clamped = clampLocalPipPosition(localPipLeft, localPipTop);
      localPipLeft = clamped[0];
      localPipTop = clamped[1];
      applyLocalPipPosition(false);
      return;
    }
    applyConnectedLocalPipLayout("preview_layout");
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
    int[] bounds = getLocalPipUsableBounds();
    if (bounds == null || localContainer == null) {
      return new int[] {Math.max(0, left), Math.max(0, top)};
    }
    int margin = dp(LOCAL_PIP_MARGIN_DP);
    int pipWidth = localContainer.getWidth() > 0 ? localContainer.getWidth() : dp(LOCAL_PIP_WIDTH_DP);
    int pipHeight = localContainer.getHeight() > 0 ? localContainer.getHeight() : dp(LOCAL_PIP_HEIGHT_DP);
    int minLeft = bounds[0] + margin;
    int maxLeft = Math.max(minLeft, bounds[2] - pipWidth - margin);
    int minTop = bounds[1] + margin;
    int maxTop = Math.max(minTop, bounds[3] - pipHeight - margin);
    return new int[] {
      Math.max(minLeft, Math.min(left, maxLeft)),
      Math.max(minTop, Math.min(top, maxTop))
    };
  }

  private FrameLayout.LayoutParams createLocalPreviewLayoutParams() {
    int[] rect = resolveConnectedLocalPipRect("create_layout_params");
    localPipLeft = rect[0];
    localPipTop = rect[1];
    FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(rect[2], rect[3]);
    params.gravity = Gravity.TOP | Gravity.START;
    params.setMargins(rect[0], rect[1], 0, 0);
    return params;
  }

  private int dp(int value) {
    return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
  }
}
