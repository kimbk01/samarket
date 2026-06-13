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

@CapacitorPlugin(name = "DibayOAuth")
public class DibayOAuthPlugin extends Plugin {
  @PluginMethod
  public void open(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.trim().isEmpty()) {
      call.reject("missing_url");
      return;
    }

    Uri uri;
    try {
      uri = Uri.parse(url.trim());
    } catch (Exception e) {
      call.reject("invalid_url");
      return;
    }

    Activity activity = getActivity();
    try {
      CustomTabsIntent tabsIntent = new CustomTabsIntent.Builder().build();
      tabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY);
      tabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
      tabsIntent.launchUrl(activity, uri);
      call.resolve();
    } catch (ActivityNotFoundException customTabError) {
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
