package com.dibay.app;

import android.app.ActivityManager;
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
  private static final java.util.Set<String> ACTIVITY_SHOWN_EMITTED = ConcurrentHashMap.newKeySet();
  private static final ConcurrentHashMap<Integer, java.lang.ref.WeakReference<IncomingCallActivity>>
      LIVE_INSTANCES = new ConcurrentHashMap<>();
  private static volatile java.lang.ref.WeakReference<IncomingCallActivity> activeInstance;

  static IncomingCallActivity peekActiveInstance() {
    return activeInstance != null ? activeInstance.get() : null;
  }

  /** Warm-only — native Connecting surface stays until web handoff. Cold uses legacy finish + loading. */
  static boolean isConnectingHandoffActive(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    IncomingCallActivity active = peekActiveInstance();
    return active != null
        && !active.finished
        && active.connectingMode
        && active.callId != null
        && callId.trim().equals(active.callId.trim());
  }

  private static boolean isWarmConnectingHandoffEligible() {
    return MainActivity.getActiveInstance() != null && MainActivity.isAppVisibleForIncomingCall();
  }

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

  static void clearVisibleFlag(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    VISIBLE_CALL_IDS.remove(callId.trim());
  }

  static java.util.Set<String> visibleCallIdsSnapshot() {
    return new java.util.HashSet<>(VISIBLE_CALL_IDS.keySet());
  }

  private static int finishLiveInstancesForCallId(String callId, String reason) {
    if (callId == null || callId.trim().isEmpty()) return 0;
    String sid = callId.trim();
    int finishedCount = 0;
    java.util.ArrayList<Integer> staleKeys = new java.util.ArrayList<>();
    for (java.util.Map.Entry<Integer, java.lang.ref.WeakReference<IncomingCallActivity>> entry :
        LIVE_INSTANCES.entrySet()) {
      IncomingCallActivity instance = entry.getValue() != null ? entry.getValue().get() : null;
      if (instance == null) {
        staleKeys.add(entry.getKey());
        continue;
      }
      if (instance.finished || instance.callId == null) continue;
      if (!sid.equals(instance.callId.trim())) continue;
      Log.i(TAG, "[call-ui] incoming_activity_finish_live callId=" + sid + " reason=" + reason);
      instance.cleanupAndFinish();
      finishedCount++;
    }
    for (Integer key : staleKeys) {
      LIVE_INSTANCES.remove(key);
    }
    return finishedCount;
  }

  private static int finishAllLiveInstances(String reason) {
    int finishedCount = 0;
    java.util.ArrayList<Integer> staleKeys = new java.util.ArrayList<>();
    for (java.util.Map.Entry<Integer, java.lang.ref.WeakReference<IncomingCallActivity>> entry :
        LIVE_INSTANCES.entrySet()) {
      IncomingCallActivity instance = entry.getValue() != null ? entry.getValue().get() : null;
      if (instance == null) {
        staleKeys.add(entry.getKey());
        continue;
      }
      if (instance.finished) continue;
      Log.i(
          TAG,
          "[call-ui] incoming_activity_finish_live_any callId="
              + instance.callId
              + " reason="
              + reason);
      instance.cleanupAndFinish();
      finishedCount++;
    }
    for (Integer key : staleKeys) {
      LIVE_INSTANCES.remove(key);
    }
    return finishedCount;
  }

  private static boolean isIncomingComponent(android.content.ComponentName component) {
    return component != null && IncomingCallActivity.class.getName().equals(component.getClassName());
  }

  private static boolean taskReferencesIncoming(ActivityManager.RecentTaskInfo info) {
    if (info == null) return false;
    if (isIncomingComponent(info.baseActivity)) return true;
    if (isIncomingComponent(info.topActivity)) return true;
    if (isIncomingComponent(info.origActivity)) return true;
    if (info.baseIntent != null && isIncomingComponent(info.baseIntent.getComponent())) return true;
    return false;
  }

  private static String taskSummary(ActivityManager.RecentTaskInfo info) {
    if (info == null) return "taskInfo=null";
    String base = info.baseActivity != null ? info.baseActivity.flattenToShortString() : "null";
    String top = info.topActivity != null ? info.topActivity.flattenToShortString() : "null";
    String orig = info.origActivity != null ? info.origActivity.flattenToShortString() : "null";
    return "taskId="
        + info.taskId
        + " base="
        + base
        + " top="
        + top
        + " orig="
        + orig
        + " numActivities="
        + info.numActivities;
  }

  static void finishActiveForCallId(Context context, String callId, String reason) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    IncomingCallActivity active = activeInstance != null ? activeInstance.get() : null;
    if (active != null
        && !active.finished
        && active.callId != null
        && sid.equals(active.callId.trim())) {
      Log.i(TAG, "[call-ui] incoming_activity_finish_active callId=" + sid + " reason=" + reason);
      active.cleanupAndFinish();
      return;
    }
    if (finishLiveInstancesForCallId(sid, reason) > 0) {
      return;
    }
    if (context != null) {
      IncomingCallTerminalHandler.broadcastFinishIncomingActivity(
          context.getApplicationContext(), sid);
    }
  }

  /** @return true when an instance was asked to finish */
  static boolean finishAnyActiveInstance(String reason) {
    IncomingCallActivity active = activeInstance != null ? activeInstance.get() : null;
    if (active == null || active.finished) return false;
    Log.i(
        TAG,
        "[call-ui] incoming_activity_finish_any_active callId="
            + active.callId
            + " reason="
            + reason);
    active.cleanupAndFinish();
    return true;
  }

  /** Shared-task leaks are detected via live instances and task top/base/orig/real components. */
  static boolean hasIncomingTask(Context context) {
    for (java.util.Map.Entry<Integer, java.lang.ref.WeakReference<IncomingCallActivity>> entry :
        LIVE_INSTANCES.entrySet()) {
      IncomingCallActivity instance = entry.getValue() != null ? entry.getValue().get() : null;
      if (instance != null && !instance.finished) {
        return true;
      }
    }
    if (context == null) return false;
    ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
    if (am == null) return false;
    try {
      for (ActivityManager.AppTask task : am.getAppTasks()) {
        if (task == null) continue;
        ActivityManager.RecentTaskInfo info = task.getTaskInfo();
        if (taskReferencesIncoming(info)) {
          return true;
        }
      }
    } catch (Exception ignored) {
    }
    return false;
  }

  /** @return true when any incoming instance/task was finished */
  static boolean finishAllIncomingTasks(Context context, String reason) {
    boolean removed = finishAllLiveInstances(reason) > 0;
    if (context == null) return removed;
    ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
    if (am == null) return removed;
    try {
      for (ActivityManager.AppTask task : am.getAppTasks()) {
        if (task == null) continue;
        ActivityManager.RecentTaskInfo info = task.getTaskInfo();
        if (taskReferencesIncoming(info)) {
          Log.i(
              TAG,
              "[call-ui] incoming_task_finish_and_remove taskId="
                  + info.taskId
                  + " reason="
                  + (reason != null ? reason : "purge")
                  + " summary="
                  + taskSummary(info));
          task.finishAndRemoveTask();
          removed = true;
        }
      }
    } catch (Exception error) {
      Log.w(
          TAG,
          "[call-ui] incoming_task_finish_failed reason="
              + (reason != null ? reason : "purge")
              + " err="
              + error.getClass().getSimpleName());
    }
    return removed;
  }

  private String callId;
  private boolean finished;
  private boolean connectingMode;
  private boolean nativeSurfaceHiddenEmitted;
  private boolean visibleIncomingNotificationCancelled;
  private BroadcastReceiver terminalReceiver;

  boolean isFinished() {
    return finished;
  }

  boolean isConnectingMode() {
    return connectingMode;
  }

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
    if (CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) {
      IncomingCallBackgroundNotifier.logLockscreenEvent(
          getApplicationContext(),
          callId,
          "incoming_activity_on_create",
          IncomingCallSurfaceOwner.getSurfaceOwner(callId),
          IncomingCallNotificationBuilder.canPostFullScreenIntent(getApplicationContext()),
          "action=" + String.valueOf(getIntent().getAction()));
    }
    LIVE_INSTANCES.put(
        System.identityHashCode(this), new java.lang.ref.WeakReference<>(this));
    activeInstance = new java.lang.ref.WeakReference<>(this);

    if (CallV4Lane.isTelegramLaneEnabled(getApplicationContext())
        && IncomingCallSurfaceOwner.isWebInAppOwner(callId)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_activity_blocked callId=" + callId + " reason=foreground_web_ssot");
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

    emitIncomingActivityShown(getIntent(), expiresAt);

    bindIncomingUi(getIntent());
    notifyNativeSurfaceVisible();

    String action = getIntent().getAction();
    if (ACTION_ACCEPT.equals(action)) {
      Log.i(
          TAG,
          "[call-ui] incoming_activity_action_accept_received callId="
              + callId
              + " source=onCreate");
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] notification_accept_action_received callId="
              + callId
              + " source=onCreate");
      Log.i(TAG, "[call-ui] notification_accept_activity_open callId=" + callId);
      if (IncomingCallSurfaceOwner.isNotificationFallbackOwner(callId)) {
        IncomingCallBackgroundNotifier.logLockscreenEvent(
            getApplicationContext(),
            callId,
            "fallback_accept_action",
            IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK,
            IncomingCallNotificationBuilder.canPostFullScreenIntent(getApplicationContext()),
            "source=onCreate");
      }
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

  private void notifyLockSurfaceInteractive() {
    if (callId == null || callId.trim().isEmpty()) return;
    IncomingCallBackgroundNotifier.onLockIncomingSurfaceInteractive(
        getApplicationContext(), callId);
    cancelVisibleIncomingNotificationOnce();
  }

  private boolean shouldDeferVisibleNotificationCancelOnLock() {
    Context app = getApplicationContext();
    return DibayKeyguardHelper.isKeyguardLocked(app) || !DibayKeyguardHelper.isInteractive(app);
  }

  private void cancelVisibleIncomingNotificationOnce() {
    if (visibleIncomingNotificationCancelled || callId == null || callId.trim().isEmpty()) return;
    if (!CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) return;
    visibleIncomingNotificationCancelled = true;
    IncomingCallNotificationBuilder.cancelVisibleIncomingNotificationAfterActivity(
        getApplicationContext(), callId);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus && !finished && callId != null) {
      applyWakeFlags();
      if (getIntent() != null) {
        bindIncomingUi(getIntent());
      }
      notifyLockSurfaceInteractive();
    }
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
    notifyLockSurfaceInteractive();
  }

  @Override
  protected void onResume() {
    super.onResume();
    applyWakeFlags();
    nativeSurfaceHiddenEmitted = false;
    if (!finished && callId != null && !callId.trim().isEmpty()) {
      if (CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) {
        IncomingCallBackgroundNotifier.logLockscreenEvent(
            getApplicationContext(),
            callId,
            "incoming_activity_on_resume",
            IncomingCallSurfaceOwner.getSurfaceOwner(callId),
            IncomingCallNotificationBuilder.canPostFullScreenIntent(getApplicationContext()),
            null);
      }
      emitIncomingActivityShown(
          getIntent(), firstNonEmpty(getIntent().getStringExtra(EXTRA_EXPIRES_AT)));
      if (getIntent() != null) {
        bindIncomingUi(getIntent());
      }
    }
    notifyNativeSurfaceVisible();
  }

  @Override
  protected void onStop() {
    notifyNativeSurfaceHidden("hidden");
    super.onStop();
  }

  /**
   * Device back — minimize instead of destroying the ringing/connecting surface.
   * finish()/decline are never invoked here; the call session and its notification/
   * foreground-service state are untouched, matching the existing minimize pattern
   * already shipped in NativeVoiceCallActivity/NativeVideoCallActivity.
   */
  @Override
  public void onBackPressed() {
    if (!finished && callId != null && !callId.trim().isEmpty()) {
      Log.i(TAG, "[call-ui] incoming_activity_back_pressed_minimize callId=" + callId);
      moveTaskToBack(true);
      return;
    }
    super.onBackPressed();
  }

  @Override
  protected void onDestroy() {
    LIVE_INSTANCES.remove(System.identityHashCode(this));
    if (activeInstance != null && activeInstance.get() == this) {
      activeInstance = null;
    }
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
    if (nextCallId != null) {
      boolean callIdChanged = callId == null || !nextCallId.equals(callId);
      if (callIdChanged) {
        callId = nextCallId;
        finished = false;
      }
      if (CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) {
        IncomingCallBackgroundNotifier.logLockscreenEvent(
            getApplicationContext(),
            callId,
            "incoming_activity_on_new_intent",
            IncomingCallSurfaceOwner.getSurfaceOwner(callId),
            IncomingCallNotificationBuilder.canPostFullScreenIntent(getApplicationContext()),
            "action=" + String.valueOf(intent.getAction()));
      }
      if (callIdChanged || !isCallVisible(callId)) {
        String expiresAt = firstNonEmpty(intent.getStringExtra(EXTRA_EXPIRES_AT));
        emitIncomingActivityShown(intent, expiresAt);
      }
      bindIncomingUi(intent);
      notifyNativeSurfaceVisible();
    }
    String action = intent.getAction();
    if (ACTION_ACCEPT.equals(action)) {
      Log.i(
          TAG,
          "[call-ui] incoming_activity_action_accept_received callId="
              + callId
              + " source=onNewIntent");
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] notification_accept_action_received callId="
              + callId
              + " source=onNewIntent");
      if (IncomingCallSurfaceOwner.isNotificationFallbackOwner(callId)) {
        IncomingCallBackgroundNotifier.logLockscreenEvent(
            getApplicationContext(),
            callId,
            "fallback_accept_action",
            IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK,
            IncomingCallNotificationBuilder.canPostFullScreenIntent(getApplicationContext()),
            "source=onNewIntent");
      }
      handleAccept();
    } else if (ACTION_DECLINE.equals(action)) {
      handleDecline();
    }
  }

  /** @visibleForTesting */
  static void clearActivityShownEmittedForTests() {
    ACTIVITY_SHOWN_EMITTED.clear();
    VISIBLE_CALL_IDS.clear();
  }

  /** @visibleForTesting */
  static boolean wasActivityShownEmittedForTests(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    return ACTIVITY_SHOWN_EMITTED.contains(callId.trim());
  }

  /** @visibleForTesting */
  static void markActivityShownEmittedForTests(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    ACTIVITY_SHOWN_EMITTED.add(callId.trim());
  }

  /** Policy B: SINGLE_TOP reuse must still cancel launch_visibility verify. */
  private void emitIncomingActivityShown(Intent intent, String expiresAt) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    if (ACTIVITY_SHOWN_EMITTED.contains(sid)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_activity_shown_skip_duplicate callId=" + sid);
      return;
    }
    if (expiresAt != null) {
      java.util.HashMap<String, String> probe = new java.util.HashMap<>();
      probe.put("expiresAt", expiresAt);
      if (FcmPayloadResolver.isExpired(probe)) {
        Log.i(TAG, "[incoming-call-native] expired_ignored callId=" + callId);
        cleanupAndFinish();
        return;
      }
    }
    ACTIVITY_SHOWN_EMITTED.add(sid);
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] incoming_activity_shown_emit callId=" + sid);
    Log.i(TAG, "[call-ui] incoming_activity_shown callId=" + callId);
    VISIBLE_CALL_IDS.put(callId.trim(), System.currentTimeMillis());
    IncomingCallBackgroundNotifier.logLockscreenEvent(
        getApplicationContext(),
        sid,
        "incoming_activity_visible_ack",
        IncomingCallSurfaceOwner.getSurfaceOwner(sid),
        IncomingCallNotificationBuilder.canPostFullScreenIntent(getApplicationContext()),
        "source=activity");
    String callTypeForVerify = firstNonEmpty(intent.getStringExtra(EXTRA_CALL_TYPE));
    IncomingCallBackgroundNotifier.onIncomingActivityShown(
        getApplicationContext(), callId, callTypeForVerify);
    if (CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] incoming_activity_shown callId=" + callId);
      IncomingCallSurfaceOwner.transitionIncomingOwner(
          getApplicationContext(),
          callId,
          IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY,
          "incoming_activity_visible");
      if (!shouldDeferVisibleNotificationCancelOnLock()) {
        cancelVisibleIncomingNotificationOnce();
      }
    }
    DibayCallLog.once("incoming_activity_created", callId, "source=activity");
    DibayCallLog.once("incoming_render", callId, "source=activity");
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
    Log.i(TAG, "[call-ui] incoming_activity_action_accept_before_coordinator callId=" + callId);
    if (CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] fsi_accept_tap callId=" + callId);
    }
    DibayCallLog.once("accept_click", callId, "source=activity");
    Log.i(TAG, "[call-ui] answer_clicked callId=" + callId + " source=activity");
    boolean lockAccept =
        DibayKeyguardHelper.isKeyguardLocked(getApplicationContext())
            || !DibayKeyguardHelper.isInteractive(getApplicationContext());
    if (lockAccept) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] accept_skip_keyguard_dismiss callId=" + callId + " reason=lock_native");
      proceedHandleAcceptAfterKeyguard();
      return;
    }
    requestDismissKeyguard(() -> proceedHandleAcceptAfterKeyguard());
  }

  private void proceedHandleAcceptAfterKeyguard() {
    if (finished) return;
    IncomingCallActionCoordinator.handleAccept(getApplicationContext(), callId);
    if (CallV4Lane.isTelegramLaneEnabled(getApplicationContext())) {
      boolean lockAccept = DibayKeyguardHelper.isKeyguardLocked(getApplicationContext());
      if (isWarmConnectingHandoffEligible() || lockAccept) {
        if (lockAccept) {
          Log.i(
              CallV4Lane.TAG,
              "[DIBAY_CALL_V4] accept_path_lock_connecting_handoff callId=" + callId);
        } else {
          Log.i(
              CallV4Lane.TAG,
              "[DIBAY_CALL_V4] accept_path_warm_connecting_handoff callId=" + callId);
        }
        enterV4ConnectingMode();
      } else {
        Log.i(
            CallV4Lane.TAG,
            "[DIBAY_CALL_V4] accept_path_cold_legacy_finish callId=" + callId);
        finishSafely();
      }
      return;
    }
    showConnectingState();
  }

  private void enterV4ConnectingMode() {
    if (finished || connectingMode) return;
    connectingMode = true;
    showConnectingState(true);
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] native_connecting_surface_shown callId=" + callId);
    IncomingCallConnectingSurface.scheduleKeepOnTop(this);
  }

  static void finishConnectingSurfaceForCall(String callId, String reason) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    IncomingCallActivity active = activeInstance != null ? activeInstance.get() : null;
    if (active != null
        && !active.finished
        && active.connectingMode
        && active.callId != null
        && sid.equals(active.callId.trim())) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] connecting_surface_finish_active callId="
              + sid
              + " reason="
              + reason);
      active.finishSafely();
      return;
    }
    finishLiveInstancesForCallId(sid, "connecting_handoff:" + reason);
  }

  private void showConnectingState() {
    showConnectingState(false);
  }

  private void showConnectingState(boolean v4Connecting) {
    LinearLayout actions = findViewById(R.id.incoming_call_actions);
    TextView kindView = findViewById(R.id.incoming_call_kind);
    ImageButton acceptBtn = findViewById(R.id.incoming_call_accept);
    ImageButton declineBtn = findViewById(R.id.incoming_call_decline);
    if (kindView != null) {
      kindView.setText(getString(R.string.incoming_call_connecting));
    }
    if (v4Connecting) {
      if (acceptBtn != null) {
        acceptBtn.setVisibility(View.GONE);
      }
      if (declineBtn != null) {
        declineBtn.setVisibility(View.VISIBLE);
        declineBtn.setOnClickListener(v -> handleConnectingEndPressed());
      }
      if (actions != null) {
        actions.setVisibility(View.VISIBLE);
      }
      return;
    }
    if (actions != null) {
      actions.setVisibility(View.GONE);
    }
  }

  static void onNativeAcceptPatchResult(Context context, String callId, boolean ok) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    IncomingCallActivity active = peekActiveInstance();
    if (active == null || active.finished || active.callId == null || !sid.equals(active.callId.trim())) {
      return;
    }
    if (!active.connectingMode) return;
    if (ok) {
      Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] lock_accept_patch_ok callId=" + sid);
      IncomingCallConnectingSurface.scheduleKeepOnTop(active);
      return;
    }
    Log.w(CallV4Lane.TAG, "[DIBAY_CALL_V4] lock_accept_patch_failed callId=" + sid);
    active.handleConnectingEndPressed();
  }

  private void handleConnectingEndPressed() {
    if (finished) return;
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] native_connecting_surface_end_pressed callId=" + callId);
    IncomingCallActionCoordinator.handleReject(getApplicationContext(), callId);
    finishSafely();
  }

  private void handleDecline() {
    if (finished) return;
    if (IncomingCallSurfaceOwner.isNotificationFallbackOwner(callId)) {
      IncomingCallBackgroundNotifier.logLockscreenEvent(
          getApplicationContext(),
          callId,
          "fallback_reject_action",
          IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK,
          IncomingCallNotificationBuilder.canPostFullScreenIntent(getApplicationContext()),
          "source=activity");
    }
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
    if (callId != null && !callId.trim().isEmpty()) {
      String sid = callId.trim();
      clearVisibleFlag(sid);
      ACTIVITY_SHOWN_EMITTED.remove(sid);
      IncomingCallBackgroundNotifier.cancelLaunchVisibilityVerify(sid);
      PendingIncomingPresentation.remove(sid);
    }
    cleanupNotification();
    finishSafely();
  }

  private void finishSafely() {
    if (finished) return;
    if (callId != null && !callId.trim().isEmpty()) {
      String sid = callId.trim();
      clearVisibleFlag(sid);
      ACTIVITY_SHOWN_EMITTED.remove(sid);
      if (activeInstance != null && activeInstance.get() == this) {
        activeInstance = null;
      }
    }
    notifyNativeSurfaceHidden("destroyed");
    finished = true;
    DibayCallLog.once("activity_finish", callId);
    finishAndRemoveTask();
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
    getWindow()
        .addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
  }

  private void requestDismissKeyguardAfterVisibleAck() {
    requestDismissKeyguard(null);
  }

  private void requestDismissKeyguard(Runnable onComplete) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      if (onComplete != null) onComplete.run();
      return;
    }
    if (!DibayKeyguardHelper.isKeyguardLocked(getApplicationContext())) {
      if (onComplete != null) onComplete.run();
      return;
    }
    try {
      android.app.KeyguardManager km = getSystemService(android.app.KeyguardManager.class);
      if (km == null) {
        if (onComplete != null) onComplete.run();
        return;
      }
      km.requestDismissKeyguard(
          this,
          new android.app.KeyguardManager.KeyguardDismissCallback() {
            private void done() {
              if (onComplete != null) {
                runOnUiThread(onComplete);
              }
            }

            @Override
            public void onDismissSucceeded() {
              done();
            }

            @Override
            public void onDismissCancelled() {
              done();
            }

            @Override
            public void onDismissError() {
              done();
            }
          });
    } catch (Exception error) {
      Log.w(
          TAG,
          "[call-ui] request_dismiss_keyguard_failed callId="
              + callId
              + " err="
              + error.getClass().getSimpleName());
      if (onComplete != null) onComplete.run();
    }
  }

  private static String firstNonEmpty(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}
