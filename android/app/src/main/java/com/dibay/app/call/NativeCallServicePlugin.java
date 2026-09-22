package com.dibay.app.call;

import android.content.Context;
import com.dibay.app.DibayCallLog;
import com.dibay.app.DibayCanonicalDeviceIdStore;
import com.dibay.app.nativevideo.NativeVideoCallApi;
import com.dibay.app.nativevideo.NativeVideoCallLane;
import com.dibay.app.nativevideo.NativeVideoCallOwner;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import com.dibay.app.nativecall.NativeCallRuntimeEndDispatcher;
import com.dibay.app.nativevoice.NativeVoiceCallApi;
import com.dibay.app.nativevoice.NativeVoiceCallLane;
import com.dibay.app.nativevoice.NativeVoiceCallOwner;
import com.dibay.app.nativevoice.NativeVoiceCallRuntime;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** JS bridge — lib/call/native/native-call-service.ts */
@CapacitorPlugin(name = "NativeCallService")
public class NativeCallServicePlugin extends Plugin {
  public static final String EVENT_NATIVE_CALL_CONNECTED = "nativeCallConnected";
  /** CUT-5C — PREPARING Activity abandoned from Native UI (END/back/destroy). */
  public static final String EVENT_NATIVE_OUTGOING_PREPARING_ABANDONED =
      "nativeOutgoingPreparingAbandoned";

  private static final Set<String> CONNECTED_EMITTED = ConcurrentHashMap.newKeySet();
  private static volatile NativeCallServicePlugin instance;

  @Override
  public void load() {
    instance = this;
  }

  /** O3 — idempotent native connected publish (metadata bind + Capacitor event, no legacy FGS). */
  public static void publishNativeConnected(
      String callId,
      String roomId,
      String mediaType,
      String direction,
      String peerUserId,
      String peerName,
      String runtime,
      String fgsOwner) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    if (!CONNECTED_EMITTED.add(sid)) return;

    String managerMedia = "video".equalsIgnoreCase(mediaType) ? "video" : "voice";
    DibayActiveCallSessionManager.bindActiveCall(
        sid, managerMedia, DibayActiveCallSessionManager.PHASE_CONNECTED);

    JSObject payload = new JSObject();
    payload.put("callId", sid);
    payload.put("roomId", roomId != null ? roomId : "");
    payload.put("mediaType", managerMedia);
    payload.put("direction", direction != null ? direction : "incoming");
    payload.put("peerUserId", peerUserId != null ? peerUserId : "");
    payload.put("peerName", peerName != null ? peerName : "");
    payload.put("connectedAtMs", System.currentTimeMillis());
    payload.put("nativeOwned", true);
    payload.put("runtime", runtime != null ? runtime : "native_voice");
    payload.put("fgsOwner", fgsOwner != null ? fgsOwner : "none");
    payload.put("source", "native_connected_bridge");

    emitNativeCallConnected(payload);
  }

  /** CUT-5C — notify JS that PREPARING was abandoned locally (no server session patch). */
  public static void publishNativeOutgoingPreparingAbandoned(String attemptId, String source) {
    if (attemptId == null || attemptId.trim().isEmpty()) return;
    JSObject payload = new JSObject();
    payload.put("attemptId", attemptId.trim());
    payload.put("source", source != null && !source.trim().isEmpty() ? source.trim() : "unknown");
    NativeCallServicePlugin plugin = instance;
    if (plugin == null) return;
    plugin.notifyListeners(EVENT_NATIVE_OUTGOING_PREPARING_ABANDONED, payload);
  }

  static void emitNativeCallConnected(JSObject payload) {
    NativeCallServicePlugin plugin = instance;
    if (plugin == null) return;
    plugin.notifyListeners(EVENT_NATIVE_CALL_CONNECTED, payload);
  }

  static void clearNativeConnectedEmitForTests() {
    CONNECTED_EMITTED.clear();
  }

  private static String resolveActiveCallIdWithPriority() {
    String managerId = DibayActiveCallSessionManager.getActiveCallId();
    if (!managerId.isEmpty()) return managerId;
    String legacyFgsId = CallForegroundService.getActiveCallId();
    if (!legacyFgsId.isEmpty()) return legacyFgsId;
    return "";
  }

  private static String resolveFgsOwner(String callId) {
    if (callId == null || callId.trim().isEmpty()) return "none";
    String sid = callId.trim();
    NativeVoiceCallRuntime.Session voiceSession = NativeVoiceCallRuntime.getSession(sid);
    if (voiceSession != null
        && voiceSession.state == NativeVoiceCallRuntime.State.CONNECTED
        && NativeVoiceCallOwner.isNativeOwned(sid)) {
      return "NativeVoiceCallService";
    }
    NativeVideoCallRuntime.Session videoSession = NativeVideoCallRuntime.getSession(sid);
    if (videoSession != null
        && videoSession.state == NativeVideoCallRuntime.State.CONNECTED
        && NativeVideoCallOwner.isNativeOwned(sid)) {
      return "NativeVideoCallService";
    }
    if (!CallForegroundService.getActiveCallId().isEmpty()) {
      return "CallForegroundService";
    }
    return "none";
  }

  private static boolean isNativeRuntimeConnected(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    String sid = callId.trim();
    NativeVoiceCallRuntime.Session voiceSession = NativeVoiceCallRuntime.getSession(sid);
    if (voiceSession != null
        && voiceSession.state == NativeVoiceCallRuntime.State.CONNECTED
        && NativeVoiceCallOwner.isNativeOwned(sid)) {
      return true;
    }
    NativeVideoCallRuntime.Session videoSession = NativeVideoCallRuntime.getSession(sid);
    return videoSession != null
        && videoSession.state == NativeVideoCallRuntime.State.CONNECTED
        && NativeVideoCallOwner.isNativeOwned(sid);
  }

  private static JSObject buildActiveCallSnapshot() {
    JSObject result = new JSObject();
    String active = resolveActiveCallIdWithPriority();
    boolean nativeConnected = isNativeRuntimeConnected(active);
    boolean managerConnected = DibayActiveCallSessionManager.isConnected();
    boolean connected = nativeConnected || managerConnected;
    String phase =
        connected
            ? DibayActiveCallSessionManager.PHASE_CONNECTED
            : DibayActiveCallSessionManager.getPhase();
    String mediaType = DibayActiveCallSessionManager.getMediaType();
    if (nativeConnected) {
      NativeVoiceCallRuntime.Session voiceSession = NativeVoiceCallRuntime.getSession(active);
      if (voiceSession != null && voiceSession.state == NativeVoiceCallRuntime.State.CONNECTED) {
        mediaType = "voice";
      } else {
        mediaType = "video";
      }
    }
    result.put("callId", active.isEmpty() ? null : active);
    result.put("phase", phase);
    result.put("mediaType", mediaType);
    result.put("connected", connected);
    result.put("fgsOwner", resolveFgsOwner(active));
    return result;
  }

  @PluginMethod
  public void prepareAccept(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String callKind = call.getString("callKind", "voice");
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    CallScreenStateReceiver.register(getContext());
    CallActivityRouter.onNativeAcceptPrep(getContext(), callId, callKind);
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }

  @PluginMethod
  public void startCall(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String callKind = call.getString("callKind", "voice");
    String phase = call.getString("phase", "active");
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    CallScreenStateReceiver.register(getContext());
    DibayActiveCallSessionManager.bindActiveCall(
        callId, callKind, DibayActiveCallSessionManager.PHASE_CONNECTED);
    CallForegroundService.start(getContext(), callId, callKind, phase);
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }

  @PluginMethod
  public void endCall(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String reason = call.getString("reason", "client_end");
    if (!DibayActiveCallSessionManager.canCleanup(reason)) {
      DibayCallLog.once("active_call_cleanup_blocked", callId, "reason=" + reason);
      JSObject blocked = new JSObject();
      blocked.put("ok", false);
      call.resolve(blocked);
      return;
    }
    if (NativeCallRuntimeEndDispatcher.dispatch(getContext(), callId, reason, "plugin_end_call")) {
      JSObject result = new JSObject();
      result.put("ok", true);
      call.resolve(result);
      return;
    }
    DibayActiveCallSessionManager.requestCleanup(getContext(), callId, reason);
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }

  @PluginMethod
  public void getActiveCallId(PluginCall call) {
    JSObject result = new JSObject();
    String active = resolveActiveCallIdWithPriority();
    result.put("callId", active.isEmpty() ? null : active);
    call.resolve(result);
  }

  @PluginMethod
  public void heartbeat(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    if (isNativeRuntimeConnected(callId)) {
      JSObject result = new JSObject();
      result.put("ok", true);
      call.resolve(result);
      return;
    }
    CallForegroundService.heartbeat(getContext(), callId);
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }

  @PluginMethod
  public void reportAppState(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String state = call.getString("state", "foreground");
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    switch (state) {
      case "background":
        DibayActiveCallSessionManager.onAppBackground(callId);
        break;
      case "screen_off":
        DibayActiveCallSessionManager.onScreenOff(callId);
        break;
      case "foreground":
      default:
        DibayActiveCallSessionManager.onAppForeground(getContext(), callId);
        break;
    }
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }

  @PluginMethod
  public void getActiveCallSnapshot(PluginCall call) {
    call.resolve(buildActiveCallSnapshot());
  }

  @PluginMethod
  public void reportRemoteEnded(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    if (NativeCallRuntimeEndDispatcher.dispatch(getContext(), callId, "ended", "plugin_remote_ended")) {
      call.resolve(new JSObject().put("ok", true));
      return;
    }
    DibayActiveCallSessionManager.onRemoteEnded(getContext(), callId);
    call.resolve(new JSObject().put("ok", true));
  }

  /** O2 — outgoing establishment handoff only (no FGS / Connected bind). */
  @PluginMethod
  public void startNativeOutgoingEstablishment(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String roomId = call.getString("roomId", "");
    String mediaType = call.getString("mediaType", "voice");
    String peerUserId = call.getString("peerUserId", "");
    String peerName = call.getString("peerName", "");
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    Context app = getContext().getApplicationContext();
    boolean nativeOwned = false;
    if (NativeVoiceCallLane.isEnabled(app) && NativeVoiceCallLane.isVoiceMediaType(mediaType)) {
      NativeVoiceCallApi.startCallerJoinAsync(app, callId, roomId, peerUserId, peerName, mediaType);
      nativeOwned = NativeVoiceCallOwner.isNativeOwned(callId);
    } else if (NativeVideoCallLane.isEnabled(app) && NativeVideoCallLane.isVideoMediaType(mediaType)) {
      NativeVideoCallApi.startCallerJoinAsync(app, callId, roomId, peerUserId, peerName, mediaType);
      nativeOwned = NativeVideoCallOwner.isNativeOwned(callId);
    }
    JSObject result = new JSObject();
    result.put("ok", nativeOwned);
    result.put("nativeOwned", nativeOwned);
    call.resolve(result);
  }

  /** CUT-5C — show PREPARING Activity before server session.id (no ringback/FGS/Agora). */
  @PluginMethod
  public void startNativeOutgoingPreparing(PluginCall call) {
    String attemptId = call.getString("attemptId", "").trim();
    String roomId = call.getString("roomId", "");
    String mediaType = call.getString("mediaType", "voice");
    String peerUserId = call.getString("peerUserId", "");
    String peerName = call.getString("peerName", "");
    if (attemptId.isEmpty()) {
      call.reject("invalid_attempt_id");
      return;
    }
    Context app = getContext().getApplicationContext();
    boolean ok = false;
    if (NativeVoiceCallLane.isEnabled(app) && NativeVoiceCallLane.isVoiceMediaType(mediaType)) {
      ok = NativeVoiceCallRuntime.startPreparing(app, attemptId, peerName, peerUserId, roomId);
    } else if (NativeVideoCallLane.isEnabled(app) && NativeVideoCallLane.isVideoMediaType(mediaType)) {
      ok = NativeVideoCallRuntime.startPreparing(app, attemptId, peerName, peerUserId, roomId);
    }
    call.resolve(new JSObject().put("ok", ok));
  }

  /** CUT-5C — close PREPARING without BIND (no server patch, no abandon event). */
  @PluginMethod
  public void finishNativeOutgoingPreparing(PluginCall call) {
    String attemptId = call.getString("attemptId", "").trim();
    if (attemptId.isEmpty()) {
      call.reject("invalid_attempt_id");
      return;
    }
    Context app = getContext().getApplicationContext();
    NativeVoiceCallRuntime.finishPreparing(app, attemptId);
    NativeVideoCallRuntime.finishPreparing(app, attemptId);
    call.resolve(new JSObject().put("ok", true));
  }

  /**
   * CUT-5C — BIND server session.id onto active PREPARING, then existing post-session path
   * (FGS connecting + ringback + Agora).
   */
  @PluginMethod
  public void bindNativeOutgoingEstablishment(PluginCall call) {
    String attemptId = call.getString("attemptId", "").trim();
    String callId = call.getString("callId", "").trim();
    String roomId = call.getString("roomId", "");
    String mediaType = call.getString("mediaType", "voice");
    String peerUserId = call.getString("peerUserId", "");
    String peerName = call.getString("peerName", "");
    if (attemptId.isEmpty() || callId.isEmpty()) {
      call.reject("invalid_bind_args");
      return;
    }
    Context app = getContext().getApplicationContext();
    boolean bound = false;
    if (NativeVoiceCallLane.isEnabled(app) && NativeVoiceCallLane.isVoiceMediaType(mediaType)) {
      bound =
          NativeVoiceCallRuntime.bindOutgoingFromPreparing(
              app, attemptId, callId, roomId, peerUserId, peerName, mediaType);
    } else if (NativeVideoCallLane.isEnabled(app) && NativeVideoCallLane.isVideoMediaType(mediaType)) {
      bound =
          NativeVideoCallRuntime.bindOutgoingFromPreparing(
              app, attemptId, callId, roomId, peerUserId, peerName, mediaType);
    }
    boolean nativeOwned =
        bound
            && (NativeVoiceCallOwner.isNativeOwned(callId)
                || NativeVideoCallOwner.isNativeOwned(callId));
    JSObject result = new JSObject();
    result.put("ok", nativeOwned);
    result.put("nativeOwned", nativeOwned);
    call.resolve(result);
  }

  @PluginMethod
  public void isNativeEstablishmentOwned(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    boolean owned =
        NativeVoiceCallOwner.isNativeOwned(callId) || NativeVideoCallOwner.isNativeOwned(callId);
    call.resolve(new JSObject().put("owned", owned));
  }

  @PluginMethod
  public void acquireScreenAwake(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String reason = call.getString("reason", "connected_video");
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    ScreenAwakeBridge.acquire(callId, reason);
    call.resolve(new JSObject().put("ok", true));
  }

  @PluginMethod
  public void releaseScreenAwake(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String reason = call.getString("reason", "cleanup");
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    ScreenAwakeBridge.release(callId, reason);
    call.resolve(new JSObject().put("ok", true));
  }

  @PluginMethod
  public void notifyScreenAwakePresentation(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String presentation = call.getString("presentation", "unknown");
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    ScreenAwakeBridge.notifyPresentationChanged(callId, presentation);
    call.resolve(new JSObject().put("ok", true));
  }

  /** Persist user_devices.device_id for Native accept / answered_elsewhere claim. */
  @PluginMethod
  public void persistCanonicalDeviceId(PluginCall call) {
    String deviceId = call.getString("deviceId", "").trim();
    if (deviceId.isEmpty()) {
      call.reject("invalid_device_id");
      return;
    }
    DibayCanonicalDeviceIdStore.save(getContext(), deviceId);
    call.resolve(new JSObject().put("ok", true));
  }

  /**
   * Member private-event eligibility + bound user — logout/guest must set false first.
   * Atomic: eligible=true requires non-empty boundUserId (mirrors iOS CUT7 contract).
   */
  @PluginMethod
  public void setMemberCallEligible(PluginCall call) {
    boolean eligible = Boolean.TRUE.equals(call.getBoolean("eligible", false));
    String reason = call.getString("reason", "js_bridge");
    String boundUserId = call.getString("boundUserId", "");
    String safeReason =
        reason != null && !reason.trim().isEmpty() ? reason.trim() : "js_bridge";
    com.dibay.app.DibayCallAuthEligibilityStore.WriteResult result =
        com.dibay.app.DibayCallAuthEligibilityStore.setMemberCallEligibility(
            getContext(),
            eligible,
            boundUserId != null ? boundUserId : "",
            safeReason);
    call.resolve(
        new JSObject()
            .put("ok", true)
            .put("eligible", result.eligible)
            .put("boundUserSet", result.boundUserSet));
  }
}
