package com.dibay.app;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.customtabs.CustomTabsServiceConnection;
import androidx.browser.customtabs.CustomTabsSession;
import java.util.Arrays;
import java.util.List;

/**
 * Capacitor {@code Browser.java} 와 동일한 Custom Tabs 계약 — 서비스 bind·warmup·session·provider 패키지.
 * bare {@code CustomTabsIntent.Builder().build()} 는 Samsung 등에서 전체 Chrome 앱으로 degrade 될 수 있다.
 */
final class OAuthCustomTabsLauncher {

  private static final String TAG = "NativeOAuthLauncher";
  private static final String FALLBACK_PACKAGE = "com.android.chrome";

  private static final List<String> CUSTOM_TAB_PACKAGES = Arrays.asList(
    "com.android.chrome",
    "com.google.android.apps.chrome",
    "com.sec.android.app.sbrowser"
  );

  private final Context context;
  @Nullable
  private CustomTabsClient customTabsClient;
  @Nullable
  private CustomTabsSession browserSession;
  @Nullable
  private String boundPackageName;

  private final CustomTabsServiceConnection connection =
    new CustomTabsServiceConnection() {
      @Override
      public void onCustomTabsServiceConnected(ComponentName name, CustomTabsClient client) {
        customTabsClient = client;
        client.warmup(0);
        boundPackageName = name.getPackageName();
        Log.i(TAG, "custom_tabs_service_connected package=" + boundPackageName);
      }

      @Override
      public void onServiceDisconnected(ComponentName name) {
        customTabsClient = null;
        browserSession = null;
        boundPackageName = null;
        Log.i(TAG, "custom_tabs_service_disconnected package=" + name.getPackageName());
      }
    };

  OAuthCustomTabsLauncher(Context context) {
    this.context = context.getApplicationContext();
  }

  boolean bindService() {
    String packageName = CustomTabsClient.getPackageName(context, CUSTOM_TAB_PACKAGES);
    if (packageName == null) {
      packageName = FALLBACK_PACKAGE;
    }
    Log.i(TAG, "custom_tabs_bind_start package=" + packageName);
    return CustomTabsClient.bindCustomTabsService(context, packageName, connection);
  }

  void unbindService() {
    try {
      context.unbindService(connection);
    } catch (IllegalArgumentException error) {
      Log.w(TAG, "custom_tabs_unbind_skipped", error);
    }
    customTabsClient = null;
    browserSession = null;
    boundPackageName = null;
  }

  void open(Activity activity, Uri url) throws CustomTabsLaunchException {
    String resolvedPackage = CustomTabsClient.getPackageName(context, CUSTOM_TAB_PACKAGES);
    if (resolvedPackage == null) {
      resolvedPackage = FALLBACK_PACKAGE;
    }

    CustomTabsIntent.Builder builder = new CustomTabsIntent.Builder(getCustomTabsSession());
    builder.setShareState(CustomTabsIntent.SHARE_STATE_OFF);

    CustomTabsIntent tabsIntent = builder.build();
    tabsIntent.intent.setPackage(resolvedPackage);
    tabsIntent.intent.putExtra(
      Intent.EXTRA_REFERRER,
      Uri.parse(Intent.URI_ANDROID_APP_SCHEME + "//" + context.getPackageName())
    );

    Log.i(
      TAG,
      "custom_tabs_launch package="
        + resolvedPackage
        + " boundPackage="
        + boundPackageName
        + " hasSession="
        + (browserSession != null)
    );

    try {
      tabsIntent.launchUrl(activity, url);
    } catch (Exception error) {
      throw new CustomTabsLaunchException("custom_tabs_launch_failed", error);
    }
  }

  @Nullable
  private CustomTabsSession getCustomTabsSession() {
    if (customTabsClient == null) {
      return null;
    }
    if (browserSession == null) {
      browserSession =
        customTabsClient.newSession(
          new CustomTabsCallback() {
            @Override
            public void onNavigationEvent(int navigationEvent, Bundle extras) {
              Log.d(TAG, "custom_tabs_navigation_event=" + navigationEvent);
            }
          }
        );
    }
    return browserSession;
  }

  static final class CustomTabsLaunchException extends Exception {
    CustomTabsLaunchException(String message, @Nullable Throwable cause) {
      super(message, cause);
    }
  }
}
