package com.dibay.app;

import android.app.Activity;
import android.net.Uri;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native OAuth launcher — Capacitor Browser 와 동일한 Custom Tabs (bind·session·package).
 * Google OAuth 는 embedded WebView 금지. ACTION_VIEW(전체 Chrome 앱) fallback 은 사용하지 않는다.
 */
@CapacitorPlugin(name = "NativeOAuthLauncher")
public class NativeOAuthLauncherPlugin extends Plugin {

  private static final String TAG = "NativeOAuthLauncher";

  private OAuthCustomTabsLauncher customTabsLauncher;

  @Override
  public void load() {
    customTabsLauncher = new OAuthCustomTabsLauncher(getContext());
  }

  @Override
  protected void handleOnResume() {
    if (customTabsLauncher != null) {
      boolean bound = customTabsLauncher.bindService();
      if (!bound) {
        Log.w(TAG, "custom_tabs_bind_failed_on_resume");
      }
    }
  }

  @Override
  protected void handleOnPause() {
    if (customTabsLauncher != null) {
      customTabsLauncher.unbindService();
    }
  }

  @PluginMethod
  public void open(PluginCall call) {
    Log.i(TAG, "NativeOAuthLauncher.open_called");

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

    Activity activity = getBridge().getActivity();
    if (activity == null) {
      activity = getActivity();
    }
    if (activity == null) {
      Log.e(TAG, "no_activity_found");
      call.reject("activity_not_found");
      return;
    }

    if (customTabsLauncher == null) {
      Log.e(TAG, "custom_tabs_launcher_uninitialized");
      call.reject("custom_tabs_unavailable");
      return;
    }

    Log.i(TAG, "custom_tabs_start");
    try {
      customTabsLauncher.open(activity, uri);
      Log.i(TAG, "custom_tabs_success");
      Log.i(TAG, "oauth_external_launch method=custom_tabs (return via dibay://auth/callback)");
      JSObject result = new JSObject();
      result.put("opened", true);
      result.put("method", "custom_tabs");
      call.resolve(result);
    } catch (OAuthCustomTabsLauncher.CustomTabsLaunchException error) {
      Log.e(TAG, "custom_tabs_failed", error);
      call.reject("custom_tabs_unavailable");
    } catch (Exception error) {
      Log.e(TAG, "custom_tabs_failed", error);
      call.reject("custom_tabs_unavailable");
    }
  }
}
