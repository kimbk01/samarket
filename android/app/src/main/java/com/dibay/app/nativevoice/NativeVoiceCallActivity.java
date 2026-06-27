package com.dibay.app.nativevoice;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;
import java.lang.ref.WeakReference;

/** Native-only voice call UI. Never hosts WebView. */
public class NativeVoiceCallActivity extends Activity {
  public static final String EXTRA_CALL_ID = "callId";

  private static WeakReference<NativeVoiceCallActivity> activeRef = new WeakReference<>(null);

  private String callId;
  private TextView title;
  private TextView subtitle;
  private Button accept;
  private Button decline;
  private Button speaker;
  private Button end;
  private boolean speakerEnabled;

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
    callId = getIntent() != null ? getIntent().getStringExtra(EXTRA_CALL_ID) : null;
    if (callId == null || callId.trim().isEmpty()) {
      finish();
      return;
    }
    callId = callId.trim();
    if (!NativeCallVisibleSurfaceOwner.claim(callId, "voice", "incoming")) {
      finish();
      return;
    }
    activeRef = new WeakReference<>(this);
    applyWakeFlags();
    buildUi();
    NativeVoiceCallLog.info("incoming_activity_shown", callId);
    NativeVoiceCallLog.info("lock_screen_visible", callId);
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    applyState(session != null ? session.state : NativeVoiceCallRuntime.State.RINGING);
  }

  @Override
  protected void onDestroy() {
    super.onDestroy();
    NativeVoiceCallActivity current = activeRef.get();
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
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setGravity(Gravity.CENTER);
    root.setPadding(48, 48, 48, 48);

    title = new TextView(this);
    title.setTextSize(26f);
    title.setGravity(Gravity.CENTER);
    root.addView(title);

    subtitle = new TextView(this);
    subtitle.setTextSize(16f);
    subtitle.setGravity(Gravity.CENTER);
    root.addView(subtitle);

    LinearLayout actions = new LinearLayout(this);
    actions.setOrientation(LinearLayout.HORIZONTAL);
    actions.setGravity(Gravity.CENTER);
    actions.setPadding(0, 40, 0, 0);

    decline = new Button(this);
    decline.setText("Decline");
    decline.setOnClickListener(v -> NativeVoiceCallRuntime.reject(this, callId));
    actions.addView(decline);

    accept = new Button(this);
    accept.setText("Accept");
    accept.setOnClickListener(v -> NativeVoiceCallRuntime.accept(this, callId));
    actions.addView(accept);

    speaker = new Button(this);
    speaker.setText("Speaker off");
    speaker.setOnClickListener(
        v -> {
          speakerEnabled = !speakerEnabled;
          speaker.setText(speakerEnabled ? "Speaker on" : "Speaker off");
          NativeVoiceCallAgoraEngine.setSpeakerEnabled(speakerEnabled);
        });
    actions.addView(speaker);

    end = new Button(this);
    end.setText("End");
    end.setOnClickListener(v -> NativeVoiceCallRuntime.end(this, callId));
    actions.addView(end);

    root.addView(actions);
    setContentView(root);
  }

  private void applyState(NativeVoiceCallRuntime.State state) {
    NativeVoiceCallRuntime.Session session = NativeVoiceCallRuntime.getSession(callId);
    String caller = session != null && !session.callerName.isEmpty() ? session.callerName : "DIBAY call";
    switch (state) {
      case RINGING:
        title.setText(caller);
        subtitle.setText("Incoming voice call");
        accept.setVisibility(View.VISIBLE);
        decline.setVisibility(View.VISIBLE);
        speaker.setVisibility(View.GONE);
        end.setVisibility(View.GONE);
        break;
      case ACCEPTING:
      case CONNECTING:
        title.setText("Connecting");
        subtitle.setText("Native voice runtime");
        accept.setVisibility(View.GONE);
        decline.setVisibility(View.GONE);
        speaker.setVisibility(View.GONE);
        end.setVisibility(View.VISIBLE);
        break;
      case CONNECTED:
        title.setText("Connected");
        subtitle.setText("Native voice call");
        accept.setVisibility(View.GONE);
        decline.setVisibility(View.GONE);
        speaker.setVisibility(View.VISIBLE);
        end.setVisibility(View.VISIBLE);
        break;
      case FAILED:
      case ENDING:
      case ENDED:
      default:
        title.setText("Ending");
        subtitle.setText("Cleaning up");
        accept.setVisibility(View.GONE);
        decline.setVisibility(View.GONE);
        speaker.setVisibility(View.GONE);
        end.setVisibility(View.GONE);
        break;
    }
  }
}
