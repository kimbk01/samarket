package com.dibay.app.nativevideo;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.lang.ref.WeakReference;

/** Native-only video call UI. Never hosts WebView. */
public class NativeVideoCallActivity extends Activity {
  public static final String EXTRA_CALL_ID = "callId";

  private static WeakReference<NativeVideoCallActivity> activeRef = new WeakReference<>(null);

  private String callId;
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
    activity.runOnUiThread(() -> activity.replaceView(activity.remoteContainer, view));
  }

  public static void finishIfActive(String callId) {
    NativeVideoCallActivity activity = activeRef.get();
    if (activity == null || callId == null || !callId.equals(activity.callId)) return;
    activity.runOnUiThread(activity::finish);
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
    activeRef = new WeakReference<>(this);
    applyWakeFlags();
    buildUi();
    NativeVideoCallLog.info("incoming_activity_shown", callId);
    NativeVideoCallLog.info("lock_screen_visible", callId);
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    applyState(session != null ? session.state : NativeVideoCallRuntime.State.RINGING);
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
    root.setBackgroundColor(Color.BLACK);

    remoteContainer = new FrameLayout(this);
    remoteContainer.setBackgroundColor(Color.rgb(18, 18, 18));
    root.addView(
        remoteContainer,
        new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

    LinearLayout overlay = new LinearLayout(this);
    overlay.setOrientation(LinearLayout.VERTICAL);
    overlay.setGravity(Gravity.CENTER_HORIZONTAL);
    overlay.setPadding(32, 64, 32, 48);

    title = new TextView(this);
    title.setTextColor(Color.WHITE);
    title.setTextSize(24f);
    title.setGravity(Gravity.CENTER);
    overlay.addView(title);

    subtitle = new TextView(this);
    subtitle.setTextColor(Color.LTGRAY);
    subtitle.setTextSize(15f);
    subtitle.setGravity(Gravity.CENTER);
    overlay.addView(subtitle);

    SpaceFill spacer = new SpaceFill(this);
    overlay.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));

    LinearLayout actions = new LinearLayout(this);
    actions.setOrientation(LinearLayout.HORIZONTAL);
    actions.setGravity(Gravity.CENTER);

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

    overlay.addView(actions);
    root.addView(
        overlay,
        new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

    localContainer = new FrameLayout(this);
    localContainer.setBackgroundColor(Color.DKGRAY);
    FrameLayout.LayoutParams localParams = new FrameLayout.LayoutParams(dp(120), dp(180));
    localParams.gravity = Gravity.TOP | Gravity.END;
    localParams.setMargins(0, dp(88), dp(20), 0);
    root.addView(localContainer, localParams);

    setContentView(root);
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
        title.setText("Connecting");
        subtitle.setText("Native video runtime");
        accept.setVisibility(View.GONE);
        decline.setVisibility(View.GONE);
        camera.setVisibility(View.VISIBLE);
        end.setVisibility(View.VISIBLE);
        localContainer.setVisibility(View.VISIBLE);
        break;
      case CONNECTED:
        title.setText("Connected");
        subtitle.setText("Native video call");
        accept.setVisibility(View.GONE);
        decline.setVisibility(View.GONE);
        camera.setVisibility(View.VISIBLE);
        end.setVisibility(View.VISIBLE);
        localContainer.setVisibility(View.VISIBLE);
        break;
      case FAILED:
      case ENDING:
      case ENDED:
      default:
        title.setText("Ending");
        subtitle.setText("Cleaning up");
        accept.setVisibility(View.GONE);
        decline.setVisibility(View.GONE);
        camera.setVisibility(View.GONE);
        end.setVisibility(View.GONE);
        break;
    }
  }

  private int dp(int value) {
    return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
  }

  private static final class SpaceFill extends View {
    SpaceFill(Activity activity) {
      super(activity);
    }
  }
}
