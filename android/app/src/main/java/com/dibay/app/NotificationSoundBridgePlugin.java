package com.dibay.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Web → Android message/general notification channel ensure (SSOT). No call ringtone. */
@CapacitorPlugin(name = "NotificationSoundBridge")
public class NotificationSoundBridgePlugin extends Plugin {

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
}
