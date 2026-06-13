package com.dibay.app;

import android.os.Bundle;
import com.capacitorjs.plugins.browser.BrowserPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(BrowserPlugin.class);
    registerPlugin(OAuthTabPlugin.class);
  }
}
