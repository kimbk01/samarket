package com.dibay.app;

import android.content.Context;
import android.util.Log;

/** Single source for incoming-call UI surface selection (foreground / FSI / CallStyle fallback). */
public final class IncomingCallRouteDecision {
  private static final String TAG = "DIBAY_CALL";

  public enum SelectedSurface {
    FOREGROUND_BANNER,
    INCOMING_ACTIVITY,
    CALLSTYLE_FALLBACK
  }

  public final String callId;
  public final boolean appVisible;
  public final boolean isInteractive;
  public final boolean isKeyguardLocked;
  public final boolean foregroundUnlockedInteractive;
  public final boolean lockBridge;
  public final boolean fsiAllowed;
  public final SelectedSurface selectedSurface;

  private IncomingCallRouteDecision(
      String callId,
      boolean appVisible,
      boolean isInteractive,
      boolean isKeyguardLocked,
      boolean foregroundUnlockedInteractive,
      boolean lockBridge,
      boolean fsiAllowed,
      SelectedSurface selectedSurface) {
    this.callId = callId;
    this.appVisible = appVisible;
    this.isInteractive = isInteractive;
    this.isKeyguardLocked = isKeyguardLocked;
    this.foregroundUnlockedInteractive = foregroundUnlockedInteractive;
    this.lockBridge = lockBridge;
    this.fsiAllowed = fsiAllowed;
    this.selectedSurface = selectedSurface;
  }

  public static IncomingCallRouteDecision resolve(Context context, boolean appVisible, String callId) {
    String sid = callId != null ? callId.trim() : "";
    boolean isInteractive = DibayKeyguardHelper.isInteractive(context);
    boolean isKeyguardLocked = DibayKeyguardHelper.isKeyguardLocked(context);
    boolean foregroundUnlockedInteractive =
        DibayKeyguardHelper.isForegroundUnlockedInteractive(appVisible, context);
    boolean lockBridge = isKeyguardLocked || !isInteractive;
    boolean fsiAllowed = IncomingCallNotificationBuilder.canPostFullScreenIntent(context);

    SelectedSurface surface;
    if (foregroundUnlockedInteractive) {
      surface = SelectedSurface.FOREGROUND_BANNER;
    } else if (lockBridge && fsiAllowed) {
      surface = SelectedSurface.INCOMING_ACTIVITY;
    } else {
      surface = SelectedSurface.CALLSTYLE_FALLBACK;
    }

    IncomingCallRouteDecision decision =
        new IncomingCallRouteDecision(
            sid,
            appVisible,
            isInteractive,
            isKeyguardLocked,
            foregroundUnlockedInteractive,
            lockBridge,
            fsiAllowed,
            surface);
    decision.log();
    return decision;
  }

  public String selectedSurfaceName() {
    switch (selectedSurface) {
      case FOREGROUND_BANNER:
        return "foreground_banner";
      case INCOMING_ACTIVITY:
        return "incoming_activity";
      case CALLSTYLE_FALLBACK:
      default:
        return "callstyle_fallback";
    }
  }

  public boolean shouldLaunchDirectIncomingActivity() {
    return selectedSurface == SelectedSurface.CALLSTYLE_FALLBACK && lockBridge && !fsiAllowed;
  }

  private void log() {
    Log.i(
        TAG,
        "[DIBAY_CALL] incoming_route_decision"
            + " callId="
            + callId
            + " appVisible="
            + appVisible
            + " isInteractive="
            + isInteractive
            + " isKeyguardLocked="
            + isKeyguardLocked
            + " foregroundUnlockedInteractive="
            + foregroundUnlockedInteractive
            + " lockBridge="
            + lockBridge
            + " fsiAllowed="
            + fsiAllowed
            + " selectedSurface="
            + selectedSurfaceName());
  }
}
