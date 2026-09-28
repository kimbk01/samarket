package com.dibay.app.intro;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.Collections;

/**
 * Native HOST only. Does not interpret Scene, Layer, geometry, media-fit, or Timeline.
 * Serves sealed pack bytes over https://dibay-intro.local — native reads bytes, WebView does not use
 * file:// fetch or crypto.subtle. Checksum owner is the local installer VERIFYING phase.
 */
public final class DibayIntroHostOwner {
  private static final String TAG = "DIBAY_IntroHost";
  public static final String LOCAL_ORIGIN = "https://dibay-intro.local";
  private static DibayIntroHostOwner instance;
  private FrameLayout overlay;
  private WebView packView;
  private String firstFailure;
  private boolean homeReady;
  private boolean firstFrameReady;
  private File packRoot;

  public static synchronized DibayIntroHostOwner get() {
    if (instance == null) instance = new DibayIntroHostOwner();
    return instance;
  }

  public void attachIfReady(Activity activity) {
    File ready = new File(activity.getFilesDir(), "dibay-intro/ready/READY");
    File index = new File(activity.getFilesDir(), "dibay-intro/ready/index.html");
    if (!ready.isFile() || !index.isFile()) {
      Log.i(TAG, "PACK_OPEN FAIL reason=ready_pack_missing");
      return;
    }
    File root = new File(activity.getFilesDir(), "dibay-intro/ready");
    activity.runOnUiThread(() -> present(activity, root));
  }

  private void present(Activity activity, File root) {
    if (overlay != null) return;
    packRoot = root;
    overlay = new FrameLayout(activity);
    overlay.setBackgroundColor(Color.parseColor("#0B421A"));
    overlay.setLayoutParams(
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    packView = new WebView(activity);
    WebSettings settings = packView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setDomStorageEnabled(true);
    packView.setBackgroundColor(Color.parseColor("#0B421A"));
    packView.addJavascriptInterface(new Bridge(), "IntroHostBridge");
    packView.setWebViewClient(
        new WebViewClient() {
          @Override
          public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) return null;
            if (!"https".equals(uri.getScheme()) || !"dibay-intro.local".equals(uri.getHost())) {
              return null;
            }
            return serveLocalPack(uri.getPath());
          }
        });
    overlay.addView(
        packView,
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    ViewGroup rootView = (ViewGroup) activity.findViewById(android.R.id.content);
    rootView.addView(overlay);
    Log.i(TAG, "PACK_OPEN BEGIN");
    packView.loadUrl(LOCAL_ORIGIN + "/index.html");
    Log.i(TAG, "PACK_OPEN PASS");
  }

  private WebResourceResponse empty(int code, String message) {
    return new WebResourceResponse(
        "text/plain", "utf-8", code, message, Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
  }

  private WebResourceResponse serveLocalPack(String path) {
    if (packRoot == null) return empty(404, "Not Found");
    String rel = path == null || path.isEmpty() || "/".equals(path) ? "index.html" : path;
    while (rel.startsWith("/")) rel = rel.substring(1);
    File file = new File(packRoot, rel);
    try {
      if (!file.getCanonicalPath().startsWith(packRoot.getCanonicalPath() + File.separator)
          && !file.getCanonicalPath().equals(packRoot.getCanonicalPath())) {
        return empty(403, "Forbidden");
      }
      if (!file.isFile()) return empty(404, "Not Found");
      String mime = guessMime(file.getName());
      return new WebResourceResponse(mime, "utf-8", new FileInputStream(file));
    } catch (Exception e) {
      Log.e(TAG, "ASSET_VERIFY FAIL reason=local_read", e);
      return empty(500, "Error");
    }
  }

  private static String guessMime(String name) {
    String ext = MimeTypeMap.getFileExtensionFromUrl(name);
    if ("html".equals(ext)) return "text/html";
    if ("js".equals(ext)) return "text/javascript";
    if ("json".equals(ext)) return "application/json";
    if ("woff2".equals(ext)) return "font/woff2";
    if ("gif".equals(ext)) return "image/gif";
    if ("png".equals(ext)) return "image/png";
    if ("jpg".equals(ext) || "jpeg".equals(ext)) return "image/jpeg";
    if ("webp".equals(ext)) return "image/webp";
    String mapped = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
    return mapped != null ? mapped : "application/octet-stream";
  }

  public void notifyHomePresentationReady(String surface) {
    homeReady = true;
    Log.i(TAG, "HOME_PRESENTATION_READY surface=" + surface);
    maybeDismiss();
  }

  private void maybeDismiss() {
    if (!homeReady || !firstFrameReady) return;
    new Handler(Looper.getMainLooper())
        .post(
            () -> {
              if (overlay == null) return;
              ViewGroup parent = (ViewGroup) overlay.getParent();
              if (parent != null) parent.removeView(overlay);
              if (packView != null) packView.destroy();
              packView = null;
              overlay = null;
            });
  }

  class Bridge {
    @JavascriptInterface
    public void trace(String json) {
      Log.i(TAG, json);
      if (json != null && json.contains("\"result\":\"FAIL\"") && firstFailure == null) {
        firstFailure = json;
        Log.e(TAG, "FIRST_FAILURE " + json);
      }
      if (json != null && json.contains("INTRO_FIRST_FRAME_READY") && json.contains("\"result\":\"PASS\"")) {
        firstFrameReady = true;
        maybeDismiss();
      }
    }
  }
}
