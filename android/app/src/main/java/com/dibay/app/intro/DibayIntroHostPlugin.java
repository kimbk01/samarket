package com.dibay.app.intro;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DibayIntroHost")
public class DibayIntroHostPlugin extends Plugin {
  @PluginMethod
  public void notifyHomePresentationReady(PluginCall call) {
    String surface = call.getString("surface", "unknown");
    DibayIntroHostOwner.get().notifyHomePresentationReady(surface);
    call.resolve();
  }
}
