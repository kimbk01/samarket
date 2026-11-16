package com.dibay.app.call;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

/**
 * 음성 통화 근접 센서 — 단일 정의 docs/audit/call-screen-awake-audit-2026-11-16.md §4-1 S5.
 *
 * <p>Telegram VoIPService 와 같은 규칙: 발신 시작·수락부터 통화 종료까지, 출력이 수화기일 때만 귀에 대면 화면을 끈다.
 * 스피커·유선 이어폰·블루투스·USB 헤드셋이면 끄지 않는다. 영상 통화는 쓰지 않는다.
 *
 * <p>근접 판정은 OS {@link PowerManager#PROXIMITY_SCREEN_OFF_WAKE_LOCK} 가 한다(잡고 있는 동안 가까우면 화면 꺼짐, 멀면 켜짐).
 * 이 클래스는 언제 잡고 놓을지만 정한다.
 */
public final class NativeCallProximityOwner {
  private static final String TAG = "DIBAY_CALL";
  private static final Object LOCK = new Object();

  private static PowerManager.WakeLock wakeLock;
  private static String activeCallId = "";
  /** Agora 출력 경로 (io.agora.rtc2.Constants.AUDIO_ROUTE_*). 아직 이벤트가 없으면 null → 기기 출력 장치로 판정. */
  private static Integer agoraRoute;
  private static boolean speakerEnabled;

  // io.agora.rtc2.Constants (full-sdk 4.6.3 javap 확인)
  private static final int AUDIO_ROUTE_EARPIECE = 1;

  private NativeCallProximityOwner() {}

  /** 음성 통화 시작(발신 시작·수락·연결) — 같은 통화면 무시. */
  public static void start(Context context, String callId, boolean speakerOn) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    synchronized (LOCK) {
      if (sid.equals(activeCallId)) return;
      if (!activeCallId.isEmpty()) {
        releaseLocked("replaced_by_" + sid, false);
      }
      activeCallId = sid;
      agoraRoute = null;
      speakerEnabled = speakerOn;
      if (wakeLock == null) {
        wakeLock = createWakeLock(context.getApplicationContext());
      }
      log("proximity_start callId=" + sid + " supported=" + (wakeLock != null));
      updateLocked(context.getApplicationContext(), "start");
    }
  }

  /** 통화 종료·실패·정리 — 다른 통화면 무시. 귀에 대고 있으면 뗀 뒤 화면이 켜진다. */
  public static void stop(String callId, String reason) {
    String sid = callId != null ? callId.trim() : "";
    synchronized (LOCK) {
      if (activeCallId.isEmpty()) return;
      if (!sid.isEmpty() && !sid.equals(activeCallId)) return;
      releaseLocked(reason, true);
      log("proximity_stop callId=" + activeCallId + " reason=" + safe(reason));
      activeCallId = "";
      agoraRoute = null;
      speakerEnabled = false;
    }
  }

  /** 스피커 버튼 결과 (Agora 가 받아들였을 때만 호출). */
  public static void onSpeakerChanged(Context context, String callId, boolean enabled) {
    synchronized (LOCK) {
      if (activeCallId.isEmpty() || callId == null || !activeCallId.equals(callId.trim())) return;
      speakerEnabled = enabled;
      updateLocked(context != null ? context.getApplicationContext() : null, "speaker_" + enabled);
    }
  }

  /** Agora onAudioRouteChanged — 이어폰·블루투스 연결·해제, 스피커 전환 모두 여기로 온다. */
  public static void onAudioRouteChanged(Context context, String callId, int routing) {
    synchronized (LOCK) {
      if (activeCallId.isEmpty() || callId == null || !activeCallId.equals(callId.trim())) return;
      agoraRoute = routing;
      updateLocked(context != null ? context.getApplicationContext() : null, "route_" + routing);
    }
  }

  private static void updateLocked(Context app, String source) {
    if (wakeLock == null || activeCallId.isEmpty()) return;
    boolean earpiece = isEarpieceRouteLocked(app);
    if (earpiece) {
      if (!wakeLock.isHeld()) {
        try {
          wakeLock.acquire();
          log("proximity_hold callId=" + activeCallId + " source=" + source);
        } catch (RuntimeException error) {
          log("proximity_hold_failed callId=" + activeCallId + " err=" + error.getClass().getSimpleName());
        }
      }
    } else {
      // 스피커·이어폰으로 바뀜 = 귀에서 뗀 상태 → 즉시 켠다 (Telegram 이어폰 연결 시 즉시 해제와 같음).
      releaseLocked(source, false);
    }
  }

  private static boolean isEarpieceRouteLocked(Context app) {
    if (speakerEnabled) return false;
    if (agoraRoute != null) return agoraRoute == AUDIO_ROUTE_EARPIECE;
    return !hasExternalOrSpeakerOutput(app);
  }

  /** Agora 이벤트 전(발신 벨·연결 직전) — 기기 출력 장치로 수화기 여부 판정. */
  private static boolean hasExternalOrSpeakerOutput(Context app) {
    if (app == null) return false;
    try {
      AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
      if (am == null) return false;
      if (am.isSpeakerphoneOn()) return true;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        for (AudioDeviceInfo device : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
          int type = device.getType();
          if (type == AudioDeviceInfo.TYPE_WIRED_HEADSET
              || type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
              || type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
              || type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
              || type == AudioDeviceInfo.TYPE_USB_HEADSET) {
            return true;
          }
        }
      }
    } catch (RuntimeException ignored) {
    }
    return false;
  }

  private static void releaseLocked(String source, boolean waitForNoProximity) {
    if (wakeLock == null || !wakeLock.isHeld()) return;
    try {
      wakeLock.release(waitForNoProximity ? PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY : 0);
      log(
          "proximity_release callId="
              + activeCallId
              + " source="
              + safe(source)
              + " waitForNoProximity="
              + waitForNoProximity);
    } catch (RuntimeException error) {
      log("proximity_release_failed callId=" + activeCallId + " err=" + error.getClass().getSimpleName());
    }
  }

  private static PowerManager.WakeLock createWakeLock(Context app) {
    try {
      PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
      if (pm == null || !pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
        return null;
      }
      PowerManager.WakeLock lock =
          pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "dibay:call-proximity");
      lock.setReferenceCounted(false);
      return lock;
    } catch (RuntimeException error) {
      log("proximity_unsupported err=" + error.getClass().getSimpleName());
      return null;
    }
  }

  private static String safe(String value) {
    return value != null && !value.trim().isEmpty() ? value.trim() : "unknown";
  }

  private static void log(String message) {
    Log.i(TAG, "[DIBAY_CALL_PROXIMITY] " + message);
  }
}
