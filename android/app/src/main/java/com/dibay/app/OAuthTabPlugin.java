package com.dibay.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * OAuth authorize URL — Custom Tab 직접 실행.
 * @capacitor/browser BrowserControllerActivity 경로는 일부 기기(Samsung 등)에서 hang 될 수 있어 분리한다.
 */
@CapacitorPlugin(name = "OAuthTab")
public class OAuthTabPlugin extends Plugin {

  @PluginMethod
  public void open(PluginCall call) {
    String urlString = call.getString("url");
    if (urlString == null || urlString.trim().isEmpty()) {
      call.reject("missing_url");
      return;
    }

    Uri uri;
    try {
      uri = Uri.parse(urlString.trim());
    } catch (Exception error) {
      call.reject("invalid_url");
      return;
    }

    Activity activity = getActivity();
    if (activity == null) {
      call.reject("no_activity");
      return;
    }

    try {
      CustomTabsIntent tabsIntent = new CustomTabsIntent.Builder().build();
      tabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY);
      tabsIntent.launchUrl(activity, uri);
      call.resolve();
    } catch (ActivityNotFoundException customTabsError) {
      try {
        Intent browserIntent = new Intent(Intent.ACTION_VIEW, uri);
        browserIntent.addCategory(Intent.CATEGORY_BROWSABLE);
        activity.startActivity(browserIntent);
        call.resolve();
      } catch (Exception browserError) {
        call.reject("browser_open_failed");
      }
    } catch (Exception error) {
      call.reject("browser_open_failed");
    }
  }
}
