package com.dibay.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import androidx.browser.customtabs.CustomTabsIntent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native OAuth launcher — ACTION_VIEW 우선, Custom Tab 2차 (안정화 전 임시).
 * @capacitor/browser BrowserControllerActivity 경로는 일부 기기에서 hang 될 수 있어 분리한다.
 */
@CapacitorPlugin(name = "NativeOAuthLauncher")
public class NativeOAuthLauncherPlugin extends Plugin {

  private static final String TAG = "NativeOAuthLauncher";

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

    if (tryActionView(activity, uri, call)) {
      return;
    }

    if (tryCustomTabs(activity, uri, call)) {
      return;
    }

    Log.e(TAG, "action_view_failed");
    call.reject("browser_open_failed");
  }

  private boolean tryActionView(Activity activity, Uri uri, PluginCall call) {
    Log.i(TAG, "action_view_start");
    try {
      Intent browserIntent = new Intent(Intent.ACTION_VIEW, uri);
      browserIntent.addCategory(Intent.CATEGORY_BROWSABLE);
      activity.startActivity(browserIntent);
      Log.i(TAG, "action_view_success");
      JSObject result = new JSObject();
      result.put("opened", true);
      result.put("method", "action_view");
      call.resolve(result);
      return true;
    } catch (ActivityNotFoundException error) {
      Log.e(TAG, "action_view_failed", error);
      return false;
    } catch (Exception error) {
      Log.e(TAG, "action_view_failed", error);
      return false;
    }
  }

  private boolean tryCustomTabs(Activity activity, Uri uri, PluginCall call) {
    Log.i(TAG, "custom_tabs_start");
    try {
      CustomTabsIntent tabsIntent = new CustomTabsIntent.Builder().build();
      tabsIntent.intent.addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY);
      tabsIntent.launchUrl(activity, uri);
      Log.i(TAG, "custom_tabs_success");
      JSObject result = new JSObject();
      result.put("opened", true);
      result.put("method", "custom_tabs");
      call.resolve(result);
      return true;
    } catch (ActivityNotFoundException error) {
      Log.e(TAG, "custom_tabs_failed", error);
      return false;
    } catch (Exception error) {
      Log.e(TAG, "custom_tabs_failed", error);
      return false;
    }
  }
}
