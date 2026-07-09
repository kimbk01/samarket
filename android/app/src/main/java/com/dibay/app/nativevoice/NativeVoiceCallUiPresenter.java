package com.dibay.app.nativevoice;

import android.content.Context;
import com.dibay.app.R;

/** Maps Native Voice Runtime session/state to render-only UI model. No ownership of session/Agora/cleanup. */
public final class NativeVoiceCallUiPresenter {
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
    public final String headerText;
    public final String localStatusText;
    public final String avatarInitial;
    public final boolean showIncomingContent;
    public final boolean showOutgoingContent;
    public final boolean showIncomingActions;
    public final boolean showActiveActions;
    public final boolean showConnectedControls;
    public final boolean showConnectedSplit;
    public final boolean showDuration;
    public final String endButtonLabel;
    public final String speakerLabel;

    Model(
        Phase phase,
        String peerName,
        String statusText,
        String headerText,
        String localStatusText,
        String avatarInitial,
        boolean showIncomingContent,
        boolean showOutgoingContent,
        boolean showIncomingActions,
        boolean showActiveActions,
        boolean showConnectedControls,
        boolean showConnectedSplit,
        boolean showDuration,
        String endButtonLabel,
        String speakerLabel) {
      this.phase = phase;
      this.peerName = peerName;
      this.statusText = statusText;
      this.headerText = headerText;
      this.localStatusText = localStatusText;
      this.avatarInitial = avatarInitial;
      this.showIncomingContent = showIncomingContent;
      this.showOutgoingContent = showOutgoingContent;
      this.showIncomingActions = showIncomingActions;
      this.showActiveActions = showActiveActions;
      this.showConnectedControls = showConnectedControls;
      this.showConnectedSplit = showConnectedSplit;
      this.showDuration = showDuration;
      this.endButtonLabel = endButtonLabel;
      this.speakerLabel = speakerLabel;
    }
  }

  private NativeVoiceCallUiPresenter() {}

  public static Model build(Context context, NativeVoiceCallRuntime.Session session, NativeVoiceCallRuntime.State state) {
    Context app = context != null ? context.getApplicationContext() : null;
    String peerName = resolvePeerName(session);
    Phase phase = resolvePhase(session, state);
    String statusText = resolveStatusText(app, phase);
    String avatarInitial = initialFromName(peerName);
    boolean ending = phase == Phase.ENDING;
    boolean incoming = phase == Phase.INCOMING;
    boolean connected = phase == Phase.CONNECTED;
    boolean dialingOrConnecting = phase == Phase.DIALING || phase == Phase.CONNECTING;
    String headerText = safeString(app, R.string.dibay_voice_call_header_connecting);
    String localStatusText =
        connected
            ? safeString(app, R.string.dibay_voice_me_status_speaking)
            : safeString(app, R.string.dibay_voice_me_status_waiting);
    String endLabel =
        phase == Phase.DIALING
            ? safeString(app, R.string.dibay_voice_call_cancel)
            : safeString(app, R.string.dibay_voice_call_end);
    String speakerLabel = safeString(app, R.string.dibay_voice_speaker);
    return new Model(
        phase,
        peerName,
        statusText,
        headerText,
        localStatusText,
        avatarInitial,
        incoming && !ending,
        !incoming && !ending,
        incoming && !ending,
        (dialingOrConnecting || connected) && !ending,
        (dialingOrConnecting || connected) && !ending,
        connected && !ending,
        connected && !ending,
        endLabel,
        speakerLabel);
  }

  public static Phase resolvePhase(NativeVoiceCallRuntime.Session session, NativeVoiceCallRuntime.State state) {
    if (state == NativeVoiceCallRuntime.State.ENDING
        || state == NativeVoiceCallRuntime.State.ENDED
        || state == NativeVoiceCallRuntime.State.FAILED) {
      return Phase.ENDING;
    }
    if (state == NativeVoiceCallRuntime.State.CONNECTED) {
      return Phase.CONNECTED;
    }
    if (state == NativeVoiceCallRuntime.State.RINGING) {
      return Phase.INCOMING;
    }
    if (session != null && session.initiator && state == NativeVoiceCallRuntime.State.CONNECTING) {
      return Phase.DIALING;
    }
    if (state == NativeVoiceCallRuntime.State.ACCEPTING || state == NativeVoiceCallRuntime.State.CONNECTING) {
      return Phase.CONNECTING;
    }
    return Phase.CONNECTING;
  }

  private static String resolvePeerName(NativeVoiceCallRuntime.Session session) {
    if (session == null || session.callerName == null || session.callerName.trim().isEmpty()) {
      return "DIBAY";
    }
    return session.callerName.trim();
  }

  private static String resolveStatusText(Context app, Phase phase) {
    if (app == null) return "";
    switch (phase) {
      case INCOMING:
        return safeString(app, R.string.dibay_voice_call_incoming);
      case DIALING:
        return safeString(app, R.string.dibay_voice_call_calling);
      case CONNECTING:
        return safeString(app, R.string.dibay_voice_call_connecting);
      case CONNECTED:
        return safeString(app, R.string.dibay_voice_call_connected);
      case ENDING:
      default:
        return safeString(app, R.string.dibay_voice_call_ending);
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
