package com.dibay.app.nativevideo;

import android.content.Context;
import com.dibay.app.R;

/** Maps Native Video Runtime session/state to render-only UI model. */
public final class NativeVideoCallUiPresenter {
  public enum Phase {
    INCOMING,
    DIALING,
    CONNECTING,
    CONNECTED,
    ENDING
  }

  public static final class Model {
    public final Phase phase;
    public final String peerName;
    public final String statusText;
    public final String avatarInitial;
    public final boolean showIncomingActions;
    public final boolean showActiveActions;
    public final boolean showConnectedControls;
    public final boolean showVideoSurfaces;
    public final boolean showLocalPreview;
    public final boolean showStatusOverlay;
    public final boolean showDuration;
    public final String endButtonLabel;
    public final String cameraLabel;

    Model(
        Phase phase,
        String peerName,
        String statusText,
        String avatarInitial,
        boolean showIncomingActions,
        boolean showActiveActions,
        boolean showConnectedControls,
        boolean showVideoSurfaces,
        boolean showLocalPreview,
        boolean showStatusOverlay,
        boolean showDuration,
        String endButtonLabel,
        String cameraLabel) {
      this.phase = phase;
      this.peerName = peerName;
      this.statusText = statusText;
      this.avatarInitial = avatarInitial;
      this.showIncomingActions = showIncomingActions;
      this.showActiveActions = showActiveActions;
      this.showConnectedControls = showConnectedControls;
      this.showVideoSurfaces = showVideoSurfaces;
      this.showLocalPreview = showLocalPreview;
      this.showStatusOverlay = showStatusOverlay;
      this.showDuration = showDuration;
      this.endButtonLabel = endButtonLabel;
      this.cameraLabel = cameraLabel;
    }
  }

  private NativeVideoCallUiPresenter() {}

  public static Model build(Context context, NativeVideoCallRuntime.Session session, NativeVideoCallRuntime.State state) {
    Context app = context != null ? context.getApplicationContext() : null;
    String peerName = resolvePeerName(session);
    Phase phase = resolvePhase(session, state);
    String statusText = resolveStatusText(app, phase);
    String avatarInitial = initialFromName(peerName);
    boolean ending = phase == Phase.ENDING;
    boolean incoming = phase == Phase.INCOMING;
    boolean connected = phase == Phase.CONNECTED;
    boolean dialingOrConnecting = phase == Phase.DIALING || phase == Phase.CONNECTING;
    boolean videoPhase = phase == Phase.CONNECTING || phase == Phase.CONNECTED;
    String endLabel =
        phase == Phase.DIALING
            ? safeString(app, R.string.dibay_video_call_cancel)
            : safeString(app, R.string.dibay_video_call_end);
    String cameraLabel = safeString(app, R.string.dibay_video_camera_on);
    return new Model(
        phase,
        peerName,
        statusText,
        avatarInitial,
        incoming && !ending,
        (dialingOrConnecting || connected) && !ending,
        connected && !ending,
        videoPhase && !ending,
        videoPhase && !ending,
        !videoPhase && !ending,
        connected && !ending,
        endLabel,
        cameraLabel);
  }

  public static Phase resolvePhase(NativeVideoCallRuntime.Session session, NativeVideoCallRuntime.State state) {
    if (state == NativeVideoCallRuntime.State.ENDING
        || state == NativeVideoCallRuntime.State.ENDED
        || state == NativeVideoCallRuntime.State.FAILED) {
      return Phase.ENDING;
    }
    if (state == NativeVideoCallRuntime.State.CONNECTED) {
      return Phase.CONNECTED;
    }
    if (state == NativeVideoCallRuntime.State.RINGING) {
      return Phase.INCOMING;
    }
    if (session != null && session.initiator && state == NativeVideoCallRuntime.State.CONNECTING) {
      return Phase.DIALING;
    }
    if (state == NativeVideoCallRuntime.State.ACCEPTING || state == NativeVideoCallRuntime.State.CONNECTING) {
      return Phase.CONNECTING;
    }
    return Phase.CONNECTING;
  }

  private static String resolvePeerName(NativeVideoCallRuntime.Session session) {
    if (session == null || session.callerName == null || session.callerName.trim().isEmpty()) {
      return "DIBAY";
    }
    return session.callerName.trim();
  }

  private static String resolveStatusText(Context app, Phase phase) {
    if (app == null) return "";
    switch (phase) {
      case INCOMING:
        return safeString(app, R.string.dibay_video_call_incoming);
      case DIALING:
        return safeString(app, R.string.dibay_video_call_calling);
      case CONNECTING:
        return safeString(app, R.string.dibay_video_call_connecting);
      case CONNECTED:
        return safeString(app, R.string.dibay_video_call_connected);
      case ENDING:
      default:
        return safeString(app, R.string.dibay_video_call_ending);
    }
  }

  private static String initialFromName(String name) {
    if (name == null || name.isEmpty()) return "D";
    return name.substring(0, 1).toUpperCase();
  }

  private static String safeString(Context app, int resId) {
    try {
      return app.getString(resId);
    } catch (RuntimeException error) {
      return "";
    }
  }
}
