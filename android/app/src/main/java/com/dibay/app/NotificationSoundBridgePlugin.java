package com.dibay.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Web → Android message/general notification channel ensure (SSOT). No call ringtone. */
@CapacitorPlugin(name = "NotificationSoundBridge")
public class NotificationSoundBridgePlugin extends Plugin {
  /** W4 sync 는 네트워크 다운로드를 포함 — 단일 백그라운드 스레드에서 직렬 실행. */
  private static final ExecutorService SYNC_EXECUTOR = Executors.newSingleThreadExecutor();

  @PluginMethod
  public void ensureChannel(PluginCall call) {
    String channelId = call.getString("channelId");
    if (channelId == null || channelId.trim().isEmpty()) {
      call.reject("channel_id_required");
      return;
    }
    String ensured =
        DibayNotificationChannelRegistry.ensureMessageChannel(getContext(), channelId.trim());
    JSObject ret = new JSObject();
    ret.put("ok", true);
    ret.put("channelId", ensured);
    call.resolve(ret);
  }

  /**
   * W4 — 관리자 SSOT 스냅샷(이벤트별 음원)을 Android 이벤트 음원 채널로 동기화. 통화(call_*) 제외.
   * 구버전 APK 에는 이 메서드가 없으며 JS 는 실패를 무시한다(기본음 유지).
   */
  @PluginMethod
  public void syncEventSounds(PluginCall call) {
    JSArray entries = call.getArray("entries");
    if (entries == null) {
      call.reject("entries_required");
      return;
    }
    SYNC_EXECUTOR.execute(
        () -> {
          try {
            JSONObject summary =
                DibayNotificationSoundChannelStore.syncEventSounds(getContext(), entries);
            JSObject ret = JSObject.fromJSONObject(summary);
            ret.put("ok", true);
            call.resolve(ret);
          } catch (Exception e) {
            call.reject("sync_failed", e);
          }
        });
  }
}
