package com.dibay.app.opening;

import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "OpeningRuntime")
public class OpeningRuntimePlugin extends Plugin {
  private final java.util.concurrent.ExecutorService io = Executors.newSingleThreadExecutor();

  @PluginMethod
  public void preparePack(PluginCall call) {
    JSObject raw = call.getData();
    if (raw == null) {
      JSObject fail = new JSObject();
      fail.put("ok", false);
      fail.put("ready", false);
      call.resolve(fail);
      return;
    }
    io.execute(
        () -> {
          org.json.JSONObject manifest;
          try {
            manifest = new org.json.JSONObject(raw.toString());
          } catch (Exception e) {
            JSObject fail = new JSObject();
            fail.put("ok", false);
            fail.put("ready", false);
            new Handler(Looper.getMainLooper()).post(() -> call.resolve(fail));
            return;
          }
          boolean installed = OpeningPackStore.install(getContext(), manifest);
          boolean ready = installed && OpeningPackStore.isReady(getContext());
          JSObject result = new JSObject();
          result.put("ok", installed);
          result.put("ready", ready);
          new Handler(Looper.getMainLooper()).post(() -> call.resolve(result));
        });
  }
}
