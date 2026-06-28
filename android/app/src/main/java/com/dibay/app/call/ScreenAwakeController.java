package com.dibay.app.call;

import android.os.Build;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import com.dibay.app.MainActivity;
import com.dibay.app.nativevideo.NativeVideoCallActivity;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import com.getcapacitor.Bridge;
import java.lang.ref.WeakReference;

/**
 * Video call screen-awake SSOT — applies FLAG_KEEP_SCREEN_ON to the actual visible owner window
 * (NativeVideoCallActivity or MainActivity WebView shell), not a single fixed Activity.
 *
 * <p>Does not touch lock-screen / keyguard / IncomingCall wake paths.
 */
public final class ScreenAwakeController {
  public static final String TAG = "DIBAY_SCREEN_AWAKE";

  private enum Owner {
    NONE,
    MAIN_ACTIVITY,
    NATIVE_VIDEO
  }

  private static final Object LOCK = new Object();
  private static WeakReference<MainActivity> mainRef = new WeakReference<>(null);
  private static WeakReference<NativeVideoCallActivity> nativeRef = new WeakReference<>(null);
  private static boolean mainResumed;
  private static boolean nativeResumed;

  private static String leasedCallId = "";
  private static Owner leasedOwner = Owner.NONE;

  private ScreenAwakeController() {}

  public static void onMainResumed(MainActivity activity) {
    if (activity == null) return;
    synchronized (LOCK) {
      mainRef = new WeakReference<>(activity);
      mainResumed = true;
    }
    sync("main_resume");
  }

  public static void onMainPaused(MainActivity activity) {
    if (activity == null) return;
    synchronized (LOCK) {
      MainActivity current = mainRef.get();
      if (current == activity) {
        mainResumed = false;
      }
    }
    sync("main_pause");
  }

  public static void onMainPipChanged(MainActivity activity, boolean inPip) {
    if (activity == null) return;
    sync(inPip ? "main_pip_enter" : "main_pip_exit");
  }

  public static void onNativeVideoResumed(NativeVideoCallActivity activity) {
    if (activity == null) return;
    synchronized (LOCK) {
      nativeRef = new WeakReference<>(activity);
      nativeResumed = true;
    }
    sync("native_video_resume");
  }

  public static void onNativeVideoPaused(NativeVideoCallActivity activity) {
    if (activity == null) return;
    synchronized (LOCK) {
      NativeVideoCallActivity current = nativeRef.get();
      if (current == activity) {
        nativeResumed = false;
      }
    }
    sync("native_video_pause");
  }

  public static void onNativeVideoPipChanged(NativeVideoCallActivity activity, boolean inPip) {
    if (activity == null) return;
    sync(inPip ? "native_video_pip_enter" : "native_video_pip_exit");
  }

  public static void onNativeVideoDestroyed(NativeVideoCallActivity activity) {
    if (activity == null) return;
    synchronized (LOCK) {
      NativeVideoCallActivity current = nativeRef.get();
      if (current == activity) {
        nativeRef = new WeakReference<>(null);
        nativeResumed = false;
      }
    }
    sync("native_video_destroy");
  }

  public static void sync(String source) {
    synchronized (LOCK) {
      String callId = resolveActiveVideoCallId();
      if (callId.isEmpty() || !shouldHoldForCall(callId)) {
        releaseLease(source + ":no_active_video");
        return;
      }
      Owner nextOwner = resolveVisibleOwner(callId);
      if (nextOwner == Owner.NONE) {
        releaseLease(source + ":no_visible_owner");
        return;
      }
      if (callId.equals(leasedCallId) && nextOwner == leasedOwner) {
        reapplyLease(callId, nextOwner, source + ":refresh");
        return;
      }
      Owner previousOwner = leasedOwner;
      String previousCallId = leasedCallId;
      releaseLeaseInternal(source + ":owner_switch");
      applyLease(callId, nextOwner, source);
      if (previousOwner != Owner.NONE && previousOwner != nextOwner) {
        logInfo(
            "screen_awake_owner_switch callId="
                + callId
                + " from="
                + ownerLabel(previousOwner)
                + " to="
                + ownerLabel(nextOwner)
                + " source="
                + safe(source));
      } else if (!callId.equals(previousCallId) && previousOwner != Owner.NONE) {
        logInfo(
            "screen_awake_owner_switch callId="
                + callId
                + " from="
                + ownerLabel(previousOwner)
                + " to="
                + ownerLabel(nextOwner)
                + " source="
                + safe(source));
      }
    }
  }

  public static void releaseAll(String callId, String source) {
    synchronized (LOCK) {
      if (leasedOwner == Owner.NONE) return;
      if (callId != null && !callId.trim().isEmpty() && !callId.trim().equals(leasedCallId)) return;
      releaseLeaseInternal(source);
    }
  }

  private static void releaseLease(String source) {
    synchronized (LOCK) {
      releaseLeaseInternal(source);
    }
  }

  private static void releaseLeaseInternal(String source) {
    if (leasedOwner == Owner.NONE) return;
    String callId = leasedCallId;
    Owner owner = leasedOwner;
    switch (owner) {
      case MAIN_ACTIVITY:
        releaseMain(mainRef.get());
        break;
      case NATIVE_VIDEO:
        releaseNative(nativeRef.get());
        break;
      default:
        break;
    }
    leasedOwner = Owner.NONE;
    leasedCallId = "";
    logInfo(
        "screen_awake_release callId="
            + safeCallId(callId)
            + " owner="
            + ownerLabel(owner)
            + " source="
            + safe(source));
  }

  private static void applyLease(String callId, Owner owner, String source) {
    switch (owner) {
      case MAIN_ACTIVITY:
        applyMain(mainRef.get());
        break;
      case NATIVE_VIDEO:
        applyNative(nativeRef.get());
        break;
      default:
        return;
    }
    leasedCallId = callId;
    leasedOwner = owner;
    logInfo(
        "screen_awake_acquire callId="
            + callId
            + " owner="
            + ownerLabel(owner)
            + " source="
            + safe(source));
  }

  private static void reapplyLease(String callId, Owner owner, String source) {
    switch (owner) {
      case MAIN_ACTIVITY:
        applyMain(mainRef.get());
        break;
      case NATIVE_VIDEO:
        applyNative(nativeRef.get());
        break;
      default:
        break;
    }
    leasedCallId = callId;
    leasedOwner = owner;
  }

  private static String resolveActiveVideoCallId() {
    String managerId = DibayActiveCallSessionManager.getActiveCallId();
    if (!managerId.isEmpty()
        && "video".equalsIgnoreCase(DibayActiveCallSessionManager.getMediaType())
        && isHoldPhase(managerId)) {
      return managerId;
    }
    NativeVideoCallActivity nativeActivity = nativeRef.get();
    if (nativeActivity != null) {
      String nativeCallId = nativeActivity.getBoundCallId();
      if (!nativeCallId.isEmpty() && isHoldPhase(nativeCallId)) {
        return nativeCallId;
      }
    }
    if (!managerId.isEmpty() && "video".equalsIgnoreCase(DibayActiveCallSessionManager.getMediaType())) {
      return managerId;
    }
    return "";
  }

  private static boolean isHoldPhase(String callId) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (session != null && isHoldState(session.state)) {
      return true;
    }
    return DibayActiveCallSessionManager.isConnected()
        && callId.equals(DibayActiveCallSessionManager.getActiveCallId())
        && "video".equalsIgnoreCase(DibayActiveCallSessionManager.getMediaType());
  }

  private static boolean shouldHoldForCall(String callId) {
    NativeVideoCallRuntime.Session session = NativeVideoCallRuntime.getSession(callId);
    if (session != null && isHoldState(session.state)) {
      return true;
    }
    return DibayActiveCallSessionManager.isConnected()
        && callId.equals(DibayActiveCallSessionManager.getActiveCallId())
        && "video".equalsIgnoreCase(DibayActiveCallSessionManager.getMediaType());
  }

  private static boolean isHoldState(NativeVideoCallRuntime.State state) {
    return state == NativeVideoCallRuntime.State.RINGING
        || state == NativeVideoCallRuntime.State.ACCEPTING
        || state == NativeVideoCallRuntime.State.CONNECTING
        || state == NativeVideoCallRuntime.State.CONNECTED;
  }

  private static Owner resolveVisibleOwner(String callId) {
    NativeVideoCallActivity nativeActivity = nativeRef.get();
    MainActivity mainActivity = mainRef.get();

    boolean nativeBound =
        nativeActivity != null
            && callId.equals(nativeActivity.getBoundCallId())
            && NativeVideoCallActivity.isShowing(callId);
    boolean nativeLive =
        nativeBound
            && (nativeResumed
                || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
                    && nativeActivity.isInPictureInPictureMode()));
    boolean mainLive = mainActivity != null && mainResumed;

    if (nativeLive) {
      return Owner.NATIVE_VIDEO;
    }
    if (mainLive) {
      return Owner.MAIN_ACTIVITY;
    }
    return Owner.NONE;
  }

  private static void applyMain(MainActivity activity) {
    if (activity == null) return;
    activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    View decor = activity.getWindow().getDecorView();
    if (decor != null) decor.setKeepScreenOn(true);
    Bridge bridge = activity.getBridge();
    if (bridge != null && bridge.getWebView() != null) {
      bridge.getWebView().setKeepScreenOn(true);
    }
  }

  private static void releaseMain(MainActivity activity) {
    if (activity == null) return;
    activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    View decor = activity.getWindow().getDecorView();
    if (decor != null) decor.setKeepScreenOn(false);
    Bridge bridge = activity.getBridge();
    if (bridge != null && bridge.getWebView() != null) {
      bridge.getWebView().setKeepScreenOn(false);
    }
  }

  private static void applyNative(NativeVideoCallActivity activity) {
    if (activity == null) return;
    activity.applyScreenAwakeHold();
  }

  private static void releaseNative(NativeVideoCallActivity activity) {
    if (activity == null) return;
    activity.releaseScreenAwakeHold();
  }

  private static String ownerLabel(Owner owner) {
    if (owner == Owner.MAIN_ACTIVITY) return "main_activity";
    if (owner == Owner.NATIVE_VIDEO) return "native_video";
    return "none";
  }

  private static String safe(String source) {
    return source != null && !source.trim().isEmpty() ? source.trim() : "unknown";
  }

  private static String safeCallId(String callId) {
    return callId != null && !callId.isEmpty() ? callId : "unknown";
  }

  private static void logInfo(String message) {
    Log.i(TAG, "[DIBAY_SCREEN_AWAKE] " + message);
  }
}
