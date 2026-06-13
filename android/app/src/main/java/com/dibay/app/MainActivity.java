package com.dibay.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import com.capacitorjs.plugins.browser.BrowserPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "DIBAY_OAuth";
  private static final String KAKAO_TAG = "DIBAY_Kakao";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Capacitor: registerPlugin must run before super.onCreate or plugins stay UNIMPLEMENTED.
    registerPlugin(BrowserPlugin.class);
    registerPlugin(NativeOAuthLauncherPlugin.class);
    registerPlugin(NativeKakaoAuthPlugin.class);
    super.onCreate(savedInstanceState);
    logKakaoBuildDiagnostics();
    logOAuthIntent(getIntent());
  }

  private void logKakaoBuildDiagnostics() {
    try {
      String appKey = getString(R.string.kakao_native_app_key).trim();
      String scheme = getString(R.string.kakao_login_scheme).trim();
      Log.i(
        KAKAO_TAG,
        "MainActivity_onCreate kakao_key_len=" + appKey.length() + " kakao_scheme=" + (scheme.isEmpty() ? "(empty)" : scheme)
      );
      Log.i(KAKAO_TAG, "MainActivity_plugins_registered NativeKakaoAuth=yes NativeOAuthLauncher=yes");
    } catch (Exception error) {
      Log.e(KAKAO_TAG, "MainActivity_kakao_diagnostics_failed", error);
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
