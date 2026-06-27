package com.dibay.app.nativevideo;

import android.content.Context;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;
import com.dibay.app.R;
import java.util.Locale;

/** Activity-bound dock presentation for Native Video CONNECTED UI. No Runtime ownership. */
public final class NativeVideoCallDockPresenter {
  public static final class Model {
    public final String peerName;
    public final String avatarInitial;
    public final String durationText;
    public final String resumeLabel;
    public final String endLabel;

    Model(
        String peerName,
        String avatarInitial,
        String durationText,
        String resumeLabel,
        String endLabel) {
      this.peerName = peerName;
      this.avatarInitial = avatarInitial;
      this.durationText = durationText;
      this.resumeLabel = resumeLabel;
      this.endLabel = endLabel;
    }
  }

  private NativeVideoCallDockPresenter() {}

  public static Model build(Context context, NativeVideoCallRuntime.Session session, String durationText) {
    Context app = context != null ? context.getApplicationContext() : null;
    String peerName = resolvePeerName(session);
    String duration = durationText != null && !durationText.trim().isEmpty() ? durationText.trim() : "00:00";
    String resumeLabel = safeString(app, R.string.dibay_call_dock_resume);
    String endLabel = safeString(app, R.string.dibay_video_call_end);
    return new Model(peerName, initialFromName(peerName), duration, resumeLabel, endLabel);
  }

  public static String formatDuration(long connectedAtElapsedMs) {
    if (connectedAtElapsedMs <= 0L) return "00:00";
    long elapsedSec = Math.max(0L, (android.os.SystemClock.elapsedRealtime() - connectedAtElapsedMs) / 1000L);
    long minutes = elapsedSec / 60L;
    long seconds = elapsedSec % 60L;
    return String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds);
  }

  public static void bind(
      View dockRoot,
      Model model,
      View.OnClickListener onResume,
      View.OnClickListener onEnd) {
    if (dockRoot == null || model == null) return;
    TextView avatarView = dockRoot.findViewById(R.id.native_call_dock_avatar_initial);
    TextView peerNameView = dockRoot.findViewById(R.id.native_call_dock_peer_name);
    TextView durationView = dockRoot.findViewById(R.id.native_call_dock_duration);
    ImageView mediaIconView = dockRoot.findViewById(R.id.native_call_dock_media_icon);
    Button resumeButton = dockRoot.findViewById(R.id.native_call_dock_resume);
    Button endButton = dockRoot.findViewById(R.id.native_call_dock_end);
    if (avatarView != null) avatarView.setText(model.avatarInitial);
    if (peerNameView != null) peerNameView.setText(model.peerName);
    if (durationView != null) durationView.setText(model.durationText);
    if (mediaIconView != null) mediaIconView.setVisibility(View.VISIBLE);
    if (resumeButton != null) {
      resumeButton.setText(model.resumeLabel);
      resumeButton.setOnClickListener(onResume);
    }
    if (endButton != null) {
      endButton.setText(model.endLabel);
      endButton.setOnClickListener(onEnd);
    }
  }

  public static void updateDuration(View dockRoot, String durationText) {
    if (dockRoot == null) return;
    TextView durationView = dockRoot.findViewById(R.id.native_call_dock_duration);
    if (durationView != null) durationView.setText(durationText != null ? durationText : "00:00");
  }

  private static String resolvePeerName(NativeVideoCallRuntime.Session session) {
    if (session == null || session.callerName == null || session.callerName.trim().isEmpty()) {
      return "DIBAY";
    }
    return session.callerName.trim();
  }

  private static String initialFromName(String name) {
    if (name == null || name.isEmpty()) return "D";
    return name.substring(0, 1).toUpperCase(Locale.getDefault());
  }

  private static String safeString(Context app, int resId) {
    try {
      return app.getString(resId);
    } catch (RuntimeException error) {
      return "";
    }
  }
}
