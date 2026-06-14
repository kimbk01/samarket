package com.dibay.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.util.Log;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * WebView {@link PermissionRequest} · Geolocation 프롬프트 — OS 런타임 허용 후 WebView 에 grant.
 */
public final class DibayWebViewPermissionDelegate {

  private static final String TAG = "DIBAY_WebPerm";
  static final int REQUEST_CODE_WEBVIEW_PERMISSIONS = 0xD1BA;

  private final Activity activity;
  private PermissionRequest pendingPermissionRequest;
  private GeolocationPermissions.Callback pendingGeoCallback;
  private String pendingGeoOrigin;

  public DibayWebViewPermissionDelegate(Activity activity) {
    this.activity = activity;
  }

  public void onPermissionRequest(PermissionRequest request) {
    if (request == null) return;
    Set<String> androidPermissions = mapWebResourcesToAndroidPermissions(request.getResources());
    if (androidPermissions.isEmpty()) {
      runOnUiThread(() -> request.deny());
      return;
    }
    String[] required = androidPermissions.toArray(new String[0]);
    if (NativeDevicePermissionsPlugin.hasAllAndroidPermissions(activity, required)) {
      runOnUiThread(() -> {
        try {
          request.grant(request.getResources());
        } catch (Exception error) {
          Log.w(TAG, "webview_media_grant_failed", error);
          request.deny();
        }
      });
      return;
    }
    pendingPermissionRequest = request;
    ActivityCompat.requestPermissions(activity, required, REQUEST_CODE_WEBVIEW_PERMISSIONS);
  }

  private void runOnUiThread(Runnable action) {
    if (activity == null) return;
    activity.runOnUiThread(action);
  }

  public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
    if (callback == null) return;
    String[] required = new String[] {
      Manifest.permission.ACCESS_FINE_LOCATION,
      Manifest.permission.ACCESS_COARSE_LOCATION,
    };
    if (NativeDevicePermissionsPlugin.hasAllAndroidPermissions(activity, required)) {
      callback.invoke(origin, true, false);
      return;
    }
    pendingGeoOrigin = origin;
    pendingGeoCallback = callback;
    ActivityCompat.requestPermissions(activity, required, REQUEST_CODE_WEBVIEW_PERMISSIONS);
  }

  public boolean onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    if (requestCode != REQUEST_CODE_WEBVIEW_PERMISSIONS) return false;

    final boolean allGranted;
    if (grantResults == null || grantResults.length == 0) {
      allGranted = false;
    } else {
      boolean ok = true;
      for (int result : grantResults) {
        if (result != PackageManager.PERMISSION_GRANTED) {
          ok = false;
          break;
        }
      }
      allGranted = ok;
    }

    PermissionRequest mediaRequest = pendingPermissionRequest;
    pendingPermissionRequest = null;
    if (mediaRequest != null) {
      runOnUiThread(() -> {
        if (allGranted) {
          try {
            mediaRequest.grant(mediaRequest.getResources());
          } catch (Exception error) {
            Log.w(TAG, "webview_media_grant_failed", error);
            mediaRequest.deny();
          }
        } else {
          mediaRequest.deny();
        }
      });
    }

    GeolocationPermissions.Callback geoCallback = pendingGeoCallback;
    String geoOrigin = pendingGeoOrigin;
    pendingGeoCallback = null;
    pendingGeoOrigin = null;
    if (geoCallback != null) {
      geoCallback.invoke(geoOrigin != null ? geoOrigin : "", allGranted, false);
    }

    return true;
  }

  private static Set<String> mapWebResourcesToAndroidPermissions(String[] resources) {
    Set<String> out = new LinkedHashSet<>();
    if (resources == null) return out;
    List<String> list = new ArrayList<>();
    for (String resource : resources) {
      if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
        list.add(Manifest.permission.RECORD_AUDIO);
      }
      if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
        list.add(Manifest.permission.CAMERA);
      }
    }
    out.addAll(list);
    return out;
  }
}
