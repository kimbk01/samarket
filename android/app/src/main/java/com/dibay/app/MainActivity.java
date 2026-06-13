package com.dibay.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import com.capacitorjs.plugins.browser.BrowserPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "DIBAY_OAuth";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Capacitor: registerPlugin must run before super.onCreate or plugins stay UNIMPLEMENTED.
    registerPlugin(BrowserPlugin.class);
    registerPlugin(NativeOAuthLauncherPlugin.class);
    registerPlugin(NativeKakaoAuthPlugin.class);
    registerPlugin(NativeGoogleAuthPlugin.class);
    super.onCreate(savedInstanceState);
    logOAuthIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    logOAuthIntent(intent);
  }

  private void logOAuthIntent(Intent intent) {
    if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
      return;
    }
    Uri data = intent.getData();
    if (data == null || !"dibay".equals(data.getScheme()) || !"auth".equals(data.getHost())) {
      return;
    }
    Log.i(TAG, "intent_received path=" + data.getPath() + " hasCode=" + (data.getQueryParameter("code") != null));
  }
}
