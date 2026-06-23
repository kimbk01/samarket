package com.dibay.app.callv4;

import android.annotation.SuppressLint;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;

/**
 * V4 Telegram Lane dedicated call screen — loads CallV4 Web route directly.
 * Phase 1: no auto-finish; connecting UI must stay visible.
 */
public class CallScreenActivity extends AppCompatActivity {
  private WebView webView;
  private String callId;

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    applyWakeFlags();
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

    callId = getIntent().getStringExtra(CallV4IntentHelper.EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) {
      Log.w(CallV4Lane.TAG, "[DIBAY_CALL_V4] call_screen_missing_call_id");
      finish();
      return;
    }
    callId = callId.trim();
    String source = getIntent().getStringExtra(CallV4IntentHelper.EXTRA_SOURCE);
    if (source == null || source.trim().isEmpty()) {
      source = "native_accept";
    }

    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] call_screen_activity_created callId=" + callId);

    webView = new WebView(this);
    setContentView(webView);

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setMediaPlaybackRequiresUserGesture(false);

    CookieManager cookieManager = CookieManager.getInstance();
    cookieManager.setAcceptCookie(true);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      cookieManager.setAcceptThirdPartyCookies(webView, true);
    }

    webView.setWebChromeClient(new WebChromeClient());
    webView.setWebViewClient(new WebViewClient());

    String url = CallV4IntentHelper.buildCallScreenUrl(this, callId, source);
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] call_screen_load_url callId=" + callId + " url=" + url);
    webView.loadUrl(url);
  }

  @Override
  public void onBackPressed() {
    moveTaskToBack(true);
  }

  @Override
  protected void onDestroy() {
    if (webView != null) {
      webView.destroy();
      webView = null;
    }
    super.onDestroy();
  }

  private void applyWakeFlags() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
    } else {
      getWindow()
          .addFlags(
              WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                  | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                  | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }
}
