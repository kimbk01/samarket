package com.dibay.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Intro 9th rebuild — HOST ONLY.
 * Does not parse Scene/Layer geometry, fit, timeline, or renderer.
 */
@CapacitorPlugin(name = "IntroShowHost")
public class IntroShowHostPlugin extends Plugin {
  private static final String TAG = "DIBAY_IntroShowHost";
  private static final Object LOCK = new Object();
  private static volatile boolean holdingSplash = false;
  private static volatile boolean presenting = false;
  private static WebView overlayWebView;

  public static boolean isHoldingSplash() {
    return holdingSplash;
  }

  public static void tryPresentFromDisk(Activity activity) {
    if (activity == null) return;
    File readyMarker = new File(activity.getFilesDir(), "intro-show/ready/READY");
    if (!readyMarker.isFile()) {
      holdingSplash = false;
      return;
    }
    holdingSplash = true;
    activity.runOnUiThread(() -> presentReadyPack(activity));
  }

  public static void abortIfPresenting(Activity activity, String reason) {
    if (!presenting) return;
    activity.runOnUiThread(
        () -> {
          evaluateHost(activity, "abort");
          Log.i(TAG, "intro_abort reason=" + reason + " call_mutation=0");
        });
  }

  @PluginMethod
  public void notifyHomePresentationReady(PluginCall call) {
    Activity activity = getActivity();
    if (activity != null) {
      activity.runOnUiThread(() -> evaluateHost(activity, "notifyHomePresentationReady"));
    }
    JSObject out = new JSObject();
    out.put("ok", true);
    call.resolve(out);
  }

  @PluginMethod
  public void abort(PluginCall call) {
    Activity activity = getActivity();
    if (activity != null) abortIfPresenting(activity, call.getString("reason", "js"));
    JSObject out = new JSObject();
    out.put("ok", true);
    call.resolve(out);
  }

  @PluginMethod
  public void stagePack(PluginCall call) {
    String packJson = call.getString("packJson");
    if (packJson == null || packJson.isEmpty()) {
      call.reject("pack_missing");
      return;
    }
    try {
      boolean ready = writePackAtomic(getContext().getFilesDir(), packJson);
      JSObject out = new JSObject();
      out.put("ready", ready);
      call.resolve(out);
    } catch (Exception error) {
      Log.e(TAG, "stage_pack_fail", error);
      call.reject("pack_stage_failed");
    }
  }

  @SuppressWarnings("deprecation")
  private static void presentReadyPack(Activity activity) {
    File readyDir = new File(activity.getFilesDir(), "intro-show/ready");
    File index = new File(readyDir, "index.html");
    if (!index.isFile()) {
      holdingSplash = false;
      return;
    }
    try {
      WebView webView = new WebView(activity);
      WebSettings settings = webView.getSettings();
      settings.setJavaScriptEnabled(true);
      settings.setDomStorageEnabled(true);
      settings.setAllowFileAccess(true);
      settings.setAllowContentAccess(true);
      settings.setAllowFileAccessFromFileURLs(true);
      settings.setAllowUniversalAccessFromFileURLs(true);
      settings.setBlockNetworkLoads(true);
      settings.setMediaPlaybackRequiresUserGesture(false);
      webView.setBackgroundColor(Color.parseColor("#0B421A"));
      webView.addJavascriptInterface(new HostBridge(activity), "IntroShowHostBridge");
      ViewGroup content = activity.findViewById(android.R.id.content);
      FrameLayout.LayoutParams params =
          new FrameLayout.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
      content.addView(webView, params);
      overlayWebView = webView;
      presenting = true;
      webView.loadUrl(index.toURI().toString());
      Log.i(TAG, "intro_overlay_loaded local_ready=1 network=0");
    } catch (Exception error) {
      holdingSplash = false;
      presenting = false;
      Log.e(TAG, "intro_present_fail_open", error);
    }
  }

  private static void evaluateHost(Activity activity, String method) {
    WebView webView = overlayWebView;
    if (webView == null) return;
    webView.evaluateJavascript(
        "globalThis.__INTRO_ENGINE_HOST__ && globalThis.__INTRO_ENGINE_HOST__." + method + "()", null);
  }

  private static void removeOverlay(Activity activity) {
    WebView webView = overlayWebView;
    overlayWebView = null;
    presenting = false;
    holdingSplash = false;
    if (webView == null) return;
    ViewGroup parent = (ViewGroup) webView.getParent();
    if (parent != null) parent.removeView(webView);
    webView.destroy();
    Log.i(TAG, "intro_overlay_removed");
  }

  private static boolean writePackAtomic(File filesDir, String packJson) throws Exception {
    JSONObject root = new JSONObject(packJson);
    JSONObject identity = root.getJSONObject("identity");
    if (!"complete".equals(identity.optString("completeness"))) {
      throw new IllegalStateException("pack_incomplete");
    }
    File rootDir = new File(filesDir, "intro-show");
    File staging = new File(rootDir, "staging");
    File ready = new File(rootDir, "ready");
    File previous = new File(rootDir, "previous");
    deleteRecursive(staging);
    if (!staging.mkdirs()) throw new IllegalStateException("staging_mkdir");
    writeText(new File(staging, "engine.js"), root.getString("engineJs"));
    writeText(new File(staging, "index.html"), root.getString("indexHtml"));
    writeText(new File(staging, "manifest.json"), root.getJSONObject("manifest").toString());
    writeText(new File(staging, "identity.json"), identity.toString());
    File mediaDir = new File(staging, "media");
    if (!mediaDir.mkdirs()) throw new IllegalStateException("media_mkdir");
    JSONObject media = root.getJSONObject("media");
    java.util.Iterator<String> keys = media.keys();
    while (keys.hasNext()) {
      String name = keys.next();
      byte[] bytes = Base64.decode(media.getString(name), Base64.DEFAULT);
      try (FileOutputStream out = new FileOutputStream(new File(mediaDir, name))) {
        out.write(bytes);
      }
    }
    writeText(new File(staging, "READY"), identity.optString("packChecksum"));
    if (previous.exists()) deleteRecursive(previous);
    if (ready.exists() && !ready.renameTo(previous)) {
      throw new IllegalStateException("previous_swap");
    }
    if (!staging.renameTo(ready)) throw new IllegalStateException("ready_swap");
    return new File(ready, "READY").isFile();
  }

  private static void writeText(File file, String text) throws Exception {
    try (FileOutputStream out = new FileOutputStream(file)) {
      out.write(text.getBytes(StandardCharsets.UTF_8));
    }
  }

  private static void deleteRecursive(File file) {
    if (file == null || !file.exists()) return;
    File[] children = file.listFiles();
    if (children != null) {
      for (File child : children) deleteRecursive(child);
    }
    //noinspection ResultOfMethodCallIgnored
    file.delete();
  }

  private static class HostBridge {
    private final Activity activity;

    HostBridge(Activity activity) {
      this.activity = activity;
    }

    @JavascriptInterface
    public void onEvent(String json) {
      String type = "";
      try {
        type = new JSONObject(json).optString("type");
      } catch (Exception ignored) {
        type = "";
      }
      final String event = type;
      new Handler(Looper.getMainLooper())
          .post(
              () -> {
                if ("INTRO_FIRST_FRAME_READY".equals(event)) {
                  holdingSplash = false;
                  MainActivity.requestWebSplashDismiss("intro_first_frame");
                  return;
                }
                if ("HANDOFF".equals(event)
                    || "HANDOFF_FAIL_OPEN".equals(event)
                    || "ABORT".equals(event)) {
                  removeOverlay(activity);
                }
              });
    }
  }
}
