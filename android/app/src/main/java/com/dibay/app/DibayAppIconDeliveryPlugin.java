package com.dibay.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge for Android Delivery Adapter v1.
 * JS passes projected appIconTotal only — no Kernel recalculation.
 */
@CapacitorPlugin(name = "DibayAppIconDelivery")
public class DibayAppIconDeliveryPlugin extends Plugin {

  @PluginMethod
  public void apply(PluginCall call) {
    Integer count = call.getInt("count");
    if (count == null) {
      call.reject("count_required");
      return;
    }
    DibayAppIconDeliveryAdapter.apply(getContext(), count);
    JSObject ret = new JSObject();
    ret.put("ok", true);
    ret.put("count", Math.max(0, count));
    call.resolve(ret);
  }
}
