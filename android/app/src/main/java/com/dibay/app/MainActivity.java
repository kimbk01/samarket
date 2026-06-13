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
    logNativeAuthBootState();
    logOAuthIntent(getIntent());
  }

  private void logNativeAuthBootState() {
    String googleWebClientId = getString(R.string.google_web_client_id).trim();
    Log.i("DIBAY_Google", "google_native_boot configured=" + !googleWebClientId.isEmpty());
    if (googleWebClientId.isEmpty()) {
      Log.w("DIBAY_Google", "google_native_boot_missing set GOOGLE_WEB_CLIENT_ID in android/local.properties then Rebuild");
    }
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
