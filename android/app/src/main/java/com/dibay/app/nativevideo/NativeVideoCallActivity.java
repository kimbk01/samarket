package com.dibay.app.nativevideo;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;
import java.lang.ref.WeakReference;

/** Native-only video call UI. Never hosts WebView. */
public class NativeVideoCallActivity extends Activity {
  public static final String EXTRA_CALL_ID = "callId";

  private static WeakReference<NativeVideoCallActivity> activeRef = new WeakReference<>(null);

  private String callId;
  private LinearLayout ringRoot;
  private FrameLayout videoRoot;
  private TextView title;
  private TextView subtitle;
  private FrameLayout remoteContainer;
  private FrameLayout localContainer;
  private Button accept;
  private Button decline;
  private Button camera;
  private Button end;
  private boolean cameraEnabled = true;

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

  /** Must run on the main thread (Agora remote setup posts here). */
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

  /** Detach local/remote SurfaceViews before Agora destroy (main thread only). */
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
    callId = getIntent() != null ? getIntent().getStringExtra(EXTRA_CALL_ID) : null;
    if (callId == null || callId.trim().isEmpty()) {
      finish();
      return;
    }
    callId = callId.trim();
    if (!NativeCallVisibleSurfaceOwner.claim(callId, "video", "incoming")) {
      finish();
      return;
    }
    activeRef = new WeakReference<>(this);
    applyWakeFlags();
    buildUi();
    logFirstIncomingSurfaceShown();
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    applyState(session != null ? session.state : NativeVideoCallRuntime.State.RINGING);
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    if (callId == null || callId.isEmpty()) return;
    NativeVideoCallLog.info(
        "video_activity_config_changed",
        callId,
        "orientation=" + newConfig.orientation);
    applyLocalPreviewLayout();
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (session != null) {
      applyState(session.state);
    }
  }

  @Override
  protected void onDestroy() {
    super.onDestroy();
    NativeVideoCallActivity current = activeRef.get();
    if (current == this) activeRef = new WeakReference<>(null);
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
  }

  private void buildUi() {
    FrameLayout root = new FrameLayout(this);

    videoRoot = new FrameLayout(this);
    videoRoot.setBackgroundColor(Color.BLACK);
    videoRoot.setVisibility(View.GONE);
    videoRoot.setClickable(false);
    videoRoot.setFocusable(false);

    remoteContainer = new FrameLayout(this);
    remoteContainer.setBackgroundColor(Color.rgb(18, 18, 18));
    remoteContainer.setClickable(false);
    remoteContainer.setFocusable(false);
    videoRoot.addView(
        remoteContainer,
        new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

    localContainer = new FrameLayout(this);
    localContainer.setBackgroundColor(Color.DKGRAY);
    localContainer.setVisibility(View.GONE);
    videoRoot.addView(localContainer, createLocalPreviewLayoutParams());

    ringRoot = buildVoiceParityRingShell();

    root.addView(
        videoRoot,
        new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    root.addView(
        ringRoot,
        new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    setContentView(root);
  }

  /** Incoming ring controls mirror NativeVoiceCallActivity layout for accept delivery parity. */
  private LinearLayout buildVoiceParityRingShell() {
    LinearLayout shell = new LinearLayout(this);
    shell.setOrientation(LinearLayout.VERTICAL);
    shell.setGravity(Gravity.CENTER);
    shell.setPadding(48, 48, 48, 48);
    shell.setClickable(true);
    shell.setFocusable(true);

    title = new TextView(this);
    title.setTextSize(26f);
    title.setGravity(Gravity.CENTER);
    shell.addView(title);

    subtitle = new TextView(this);
    subtitle.setTextSize(16f);
    subtitle.setGravity(Gravity.CENTER);
    shell.addView(subtitle);

    LinearLayout actions = new LinearLayout(this);
    actions.setOrientation(LinearLayout.HORIZONTAL);
    actions.setGravity(Gravity.CENTER);
    actions.setPadding(0, 40, 0, 0);

    decline = new Button(this);
    decline.setText("Decline");
    decline.setOnClickListener(v -> NativeVideoCallRuntime.reject(this, callId));
    actions.addView(decline);

    accept = new Button(this);
    accept.setText("Accept");
    accept.setOnClickListener(v -> NativeVideoCallRuntime.accept(this, callId));
    actions.addView(accept);

    camera = new Button(this);
    camera.setText("Camera on");
    camera.setOnClickListener(
        v -> {
          cameraEnabled = !cameraEnabled;
          camera.setText(cameraEnabled ? "Camera on" : "Camera off");
          NativeVideoCallAgoraEngine.setCameraEnabled(cameraEnabled);
        });
    actions.addView(camera);

    end = new Button(this);
    end.setText("End");
    end.setOnClickListener(v -> NativeVideoCallRuntime.end(this, callId));
    actions.addView(end);

    shell.addView(actions);
    return shell;
  }

  private void replaceView(FrameLayout container, View view) {
    if (container == null || view == null) return;
    if (view.getParent() instanceof FrameLayout) {
      ((FrameLayout) view.getParent()).removeView(view);
    }
    container.removeAllViews();
    container.addView(
        view,
        new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
  }

  private void applyState(NativeVideoCallRuntime.State state) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    String caller = session != null && !session.callerName.isEmpty() ? session.callerName : "DIBAY call";
    switch (state) {
      case RINGING:
        videoRoot.setVisibility(View.GONE);
        ringRoot.setBackgroundColor(Color.TRANSPARENT);
        title.setText(caller);
        subtitle.setText("Incoming video call");
        accept.setVisibility(View.VISIBLE);
        decline.setVisibility(View.VISIBLE);
        camera.setVisibility(View.GONE);
        end.setVisibility(View.GONE);
        localContainer.setVisibility(View.GONE);
        break;
      case ACCEPTING:
      case CONNECTING:
        videoRoot.setVisibility(View.VISIBLE);
        ringRoot.setBackgroundColor(Color.TRANSPARENT);
        title.setTextColor(Color.WHITE);
        subtitle.setTextColor(Color.LTGRAY);
        title.setText("Connecting");
        subtitle.setText("Native video runtime");
        accept.setVisibility(View.GONE);
        decline.setVisibility(View.GONE);
        camera.setVisibility(View.VISIBLE);
        end.setVisibility(View.VISIBLE);
        localContainer.setVisibility(View.VISIBLE);
        NativeVideoCallAgoraEngine.onRemoteRenderSurfaceReady(callId);
        break;
      case CONNECTED:
        videoRoot.setVisibility(View.VISIBLE);
        ringRoot.setBackgroundColor(Color.TRANSPARENT);
        title.setTextColor(Color.WHITE);
        subtitle.setTextColor(Color.LTGRAY);
        title.setText("Connected");
        subtitle.setText("Native video call");
        accept.setVisibility(View.GONE);
        decline.setVisibility(View.GONE);
        camera.setVisibility(View.VISIBLE);
        end.setVisibility(View.VISIBLE);
        localContainer.setVisibility(View.VISIBLE);
        NativeVideoCallAgoraEngine.onRemoteRenderSurfaceReady(callId);
        break;
      case FAILED:
      case ENDING:
      case ENDED:
      default:
        videoRoot.setVisibility(View.GONE);
        ringRoot.setBackgroundColor(Color.TRANSPARENT);
        title.setText("Ending");
        subtitle.setText("Cleaning up");
        accept.setVisibility(View.GONE);
        decline.setVisibility(View.GONE);
        camera.setVisibility(View.GONE);
        end.setVisibility(View.GONE);
        localContainer.setVisibility(View.GONE);
        break;
    }
  }

  private boolean ensureVideoRootForRemoteRender() {
    if (videoRoot == null || remoteContainer == null) return false;
    videoRoot.setVisibility(View.VISIBLE);
    remoteContainer.setVisibility(View.VISIBLE);
    return true;
  }

  /** First cold show only — rotation uses video_activity_config_changed (Telegram parity). */
  private void logFirstIncomingSurfaceShown() {
    NativeVideoCallLog.info("incoming_activity_shown", callId);
    NativeVideoCallLog.info("lock_screen_visible", callId);
  }

  private void applyLocalPreviewLayout() {
    if (localContainer == null) return;
    FrameLayout.LayoutParams params = createLocalPreviewLayoutParams();
    localContainer.setLayoutParams(params);
  }

  private FrameLayout.LayoutParams createLocalPreviewLayoutParams() {
    FrameLayout.LayoutParams localParams = new FrameLayout.LayoutParams(dp(120), dp(180));
    localParams.gravity = Gravity.TOP | Gravity.END;
    localParams.setMargins(0, dp(88), dp(20), 0);
    return localParams;
  }

  private int dp(int value) {
    return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
  }
}
