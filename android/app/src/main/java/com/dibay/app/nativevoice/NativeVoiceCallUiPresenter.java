package com.dibay.app.nativevoice;

import android.content.Context;
import com.dibay.app.IncomingCallUiCopy;
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
    public final String avatarInitial;
    public final boolean showIncomingActions;
    public final boolean showMediaActions;
    public final boolean micChromeEnabled;
    public final boolean showDuration;

    Model(
        Phase phase,
        String peerName,
        String statusText,
        String avatarInitial,
        boolean showIncomingActions,
        boolean showMediaActions,
        boolean micChromeEnabled,
        boolean showDuration) {
      this.phase = phase;
      this.peerName = peerName;
      this.statusText = statusText;
      this.avatarInitial = avatarInitial;
      this.showIncomingActions = showIncomingActions;
      this.showMediaActions = showMediaActions;
      this.micChromeEnabled = micChromeEnabled;
      this.showDuration = showDuration;
    }
  }

  private NativeVoiceCallUiPresenter() {}

  public static Model build(Context context, NativeVoiceCallRuntime.Session session, NativeVoiceCallRuntime.State state) {
    Context app = context != null ? context.getApplicationContext() : null;
    String peerName = resolvePeerName(session);
    Phase phase = resolvePhase(session, state);
    String statusText = resolveStatusText(app, phase);
    String avatarInitial = IncomingCallUiCopy.peerInitial(peerName);
    boolean ending = phase == Phase.ENDING;
    boolean incoming = phase == Phase.INCOMING;
    boolean connected = phase == Phase.CONNECTED;
    boolean dialingOrConnecting = phase == Phase.DIALING || phase == Phase.CONNECTING;
    return new Model(
        phase,
        peerName,
        statusText,
        avatarInitial,
        incoming && !ending,
        (dialingOrConnecting || connected) && !ending,
        connected && !ending,
        connected && !ending);
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
    return IncomingCallUiCopy.sanitizeNickname(session.callerName.trim());
  }

  private static String resolveStatusText(Context app, Phase phase) {
    if (app == null) return "";
    switch (phase) {
      case INCOMING:
        return safeString(app, R.string.dibay_voice_call_incoming);
      case DIALING:
        return safeString(app, R.string.dibay_voice_call_dialing);
      case CONNECTING:
        return safeString(app, R.string.dibay_voice_call_connecting);
      case CONNECTED:
        return safeString(app, R.string.dibay_voice_call_connected);
      case ENDING:
      default:
        return safeString(app, R.string.dibay_voice_call_ending);
    }
  }

  private static String safeString(Context app, int resId) {
    try {
      return app.getString(resId);
    } catch (RuntimeException error) {
      return "";
    }
  }
}
