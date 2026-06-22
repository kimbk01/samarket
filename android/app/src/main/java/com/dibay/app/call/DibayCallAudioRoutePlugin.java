package com.dibay.app.call;

import android.content.Context;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;

/** Android 통화 출력 라우트 — JS: lib/community-messenger/native-call-audio-route.client.ts */
@CapacitorPlugin(name = "DibayCallAudioRoute")
public class DibayCallAudioRoutePlugin extends Plugin {
  private AudioManager audioManager;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private AudioDeviceCallback deviceCallback;
  private boolean savedAudioState = false;
  private int savedMode = AudioManager.MODE_NORMAL;
  private boolean savedSpeakerphoneOn = false;

  @Override
  public void load() {
    audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    registerRouteCallbacks();
  }

  @PluginMethod
  public void getCurrentRoute(PluginCall call) {
    call.resolve(buildResult(false, false, "noop", "get_current_route"));
  }

  @PluginMethod
  public void getAvailableRoutes(PluginCall call) {
    JSObject result = buildResult(false, false, "noop", "get_available_routes");
    result.put("availableRoutes", availableRouteNames());
    call.resolve(result);
  }

  @PluginMethod
  public void setSpeakerphoneEnabled(PluginCall call) {
    boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
    String reason = call.getString("reason", "set_speakerphone");
    call.resolve(applySpeakerphone(enabled, reason));
  }

  @PluginMethod
  public void release(PluginCall call) {
    String reason = call.getString("reason", "release");
    JSObject result = releaseRoute(reason);
    call.resolve(result);
  }

  private void registerRouteCallbacks() {
    if (audioManager == null) return;
    deviceCallback =
        new AudioDeviceCallback() {
          @Override
          public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
            notifyRouteChanged("device_added");
          }

          @Override
          public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
            notifyRouteChanged("device_removed");
          }
        };
    audioManager.registerAudioDeviceCallback(deviceCallback, mainHandler);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      Executor executor = command -> mainHandler.post(command);
      audioManager.addOnCommunicationDeviceChangedListener(
          executor, device -> notifyRouteChanged("communication_device_changed"));
    }
  }

  private void notifyRouteChanged(String reason) {
    JSObject payload = new JSObject();
    payload.put("result", buildResult(false, false, "noop", reason));
    notifyListeners("routeChanged", payload);
  }

  private JSObject applySpeakerphone(boolean enabled, String reason) {
    if (audioManager == null) {
      return result(enabled, false, "unknown", false, "noop", "audio_manager_missing");
    }

    saveAudioStateOnce();
    audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);

    String external = currentExternalRoute();
    if (external != null || hasExternalOutputDevice()) {
      String actual = external != null ? external : currentRouteName();
      return result(enabled, false, actual, true, "noop", reason);
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      AudioDeviceInfo target = findCommunicationDevice(enabled);
      if (target != null) {
        boolean ok = audioManager.setCommunicationDevice(target);
        return result(enabled, ok, currentRouteName(), false, "setCommunicationDevice", reason);
      }
    }

    audioManager.setSpeakerphoneOn(enabled);
    return result(enabled, true, currentRouteName(), false, "setSpeakerphoneOn", reason);
  }

  private JSObject releaseRoute(String reason) {
    if (audioManager == null) {
      return result(false, false, "unknown", false, "noop", "audio_manager_missing");
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audioManager.clearCommunicationDevice();
    }
    if (savedAudioState) {
      audioManager.setSpeakerphoneOn(savedSpeakerphoneOn);
      audioManager.setMode(savedMode);
      savedAudioState = false;
    } else {
      audioManager.setSpeakerphoneOn(false);
      audioManager.setMode(AudioManager.MODE_NORMAL);
    }
    return result(false, true, currentRouteName(), hasExternalOutputDevice(), "noop", reason);
  }

  private void saveAudioStateOnce() {
    if (savedAudioState || audioManager == null) return;
    savedMode = audioManager.getMode();
    savedSpeakerphoneOn = audioManager.isSpeakerphoneOn();
    savedAudioState = true;
  }

  private AudioDeviceInfo findCommunicationDevice(boolean speaker) {
    if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null;
    for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
      int type = device.getType();
      if (speaker && type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return device;
      if (!speaker && type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return device;
    }
    return null;
  }

  private JSObject buildResult(boolean requestedSpeaker, boolean applied, String api, String reason) {
    String route = currentRouteName();
    return result(requestedSpeaker, applied, route, isExternalRoute(route), api, reason);
  }

  private JSObject result(
      boolean requestedSpeaker,
      boolean applied,
      String actualRoute,
      boolean externalDeviceConnected,
      String api,
      String reason) {
    JSObject result = new JSObject();
    result.put("requestedSpeaker", requestedSpeaker);
    result.put("applied", applied);
    result.put("actualRoute", actualRoute);
    result.put("externalDeviceConnected", externalDeviceConnected);
    result.put("api", api);
    result.put("reason", reason);
    return result;
  }

  private String currentRouteName() {
    if (audioManager == null) return "unknown";
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      AudioDeviceInfo current = audioManager.getCommunicationDevice();
      String route = routeName(current);
      if (!"unknown".equals(route)) return route;
    }
    String external = currentExternalRoute();
    if (external != null) return external;
    return audioManager.isSpeakerphoneOn() ? "speaker" : "earpiece";
  }

  @SuppressWarnings("deprecation")
  private String currentExternalRoute() {
    if (audioManager == null) return null;
    if (audioManager.isBluetoothScoOn() || audioManager.isBluetoothA2dpOn()) return "bluetooth";
    if (audioManager.isWiredHeadsetOn()) return "wired";
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      for (AudioDeviceInfo device : audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
        String route = routeName(device);
        if ("bluetooth".equals(route) || "wired".equals(route)) return route;
      }
    }
    return null;
  }

  private boolean hasExternalOutputDevice() {
    return currentExternalRoute() != null;
  }

  private boolean isExternalRoute(String route) {
    return "bluetooth".equals(route) || "wired".equals(route);
  }

  private List<String> availableRouteNames() {
    ArrayList<String> out = new ArrayList<>();
    if (audioManager == null) return out;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
        String route = routeName(device);
        if (!out.contains(route)) out.add(route);
      }
      return out;
    }
    out.add("earpiece");
    out.add("speaker");
    String external = currentExternalRoute();
    if (external != null && !out.contains(external)) out.add(external);
    return out;
  }

  private String routeName(AudioDeviceInfo device) {
    if (device == null) return "unknown";
    switch (device.getType()) {
      case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
        return "speaker";
      case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE:
        return "earpiece";
      case AudioDeviceInfo.TYPE_WIRED_HEADSET:
      case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
      case AudioDeviceInfo.TYPE_USB_HEADSET:
        return "wired";
      case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
      case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
        return "bluetooth";
      default:
        return "unknown";
    }
  }
}
