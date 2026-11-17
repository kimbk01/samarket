package com.dibay.app;

import android.util.Log;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 기기 ◁(뒤로) — DIBAY 는 「받아서 할 일이 있을 때만」 받는다 (S1, docs/audit/android-system-nav-2026-11-17/s1-s3-design.md).
 *
 * <p>할 일 = WebView 에 이전 페이지가 있음({@code canGoBack}) 또는 웹이 「◁ 를 받겠다」고 알림(화면 위 창·알림 이동 직후).
 * 할 일이 없으면 이 처리는 꺼져 있고 Android 가 직접 처리한다(첫 화면이면 앱이 뒤로 감). 공식 WebView 방식
 * {@code isEnabled = webView.canGoBack()} 과 같다. Capacitor App 플러그인의 상시 켜진 뒤로 처리는
 * {@code capacitor.config.ts plugins.App.disableBackButtonHandler} 로 끈다 — 이 클래스가 그 자리를 대신한다.
 */
@CapacitorPlugin(name = "DibaySystemBack")
public class DibaySystemBackPlugin extends Plugin {

  private static final String TAG = "DIBAY_SYSBACK";
  static final String EVENT_BACK_BUTTON = "backButton";

  private static volatile DibaySystemBackPlugin instance;

  private OnBackPressedCallback callback;
  /** 웹(overlay-back-stack)이 ◁ 를 받겠다고 알린 상태. UI 스레드에서만 바꾼다. */
  private boolean webWantsBack = false;

  @Override
  public void load() {
    instance = this;
    callback =
        new OnBackPressedCallback(false) {
          @Override
          public void handleOnBackPressed() {
            WebView webView = bridge.getWebView();
            boolean canGoBack = webView != null && webView.canGoBack();
            if (webWantsBack && hasListeners(EVENT_BACK_BUTTON)) {
              JSObject data = new JSObject();
              data.put("canGoBack", canGoBack);
              notifyListeners(EVENT_BACK_BUTTON, data, true);
              return;
            }
            if (canGoBack) {
              webView.goBack();
              return;
            }
            // 켜짐 상태가 늦게 바뀐 경우 — 할 일이 없으므로 끄고 Android 에 그대로 넘긴다.
            Log.i(TAG, "stale_enabled_pass_to_system");
            setEnabled(false);
            getActivity().getOnBackPressedDispatcher().onBackPressed();
            refresh();
          }
        };
    getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), callback);
    refresh();
  }

  /** 웹: 리스너를 붙인 뒤 true, 뗀 뒤 false. */
  @PluginMethod
  public void setActive(PluginCall call) {
    final boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
    getActivity()
        .runOnUiThread(
            () -> {
              webWantsBack = active;
              refresh();
              call.resolve();
            });
  }

  /** WebView 기록이 바뀔 때(DibayBridgeWebViewClient) — UI 스레드에서 불린다. */
  static void onWebViewHistoryChanged() {
    DibaySystemBackPlugin plugin = instance;
    if (plugin != null) plugin.refresh();
  }

  private void refresh() {
    OnBackPressedCallback cb = callback;
    if (cb == null) return;
    WebView webView = bridge != null ? bridge.getWebView() : null;
    boolean canGoBack = webView != null && webView.canGoBack();
    boolean enabled = webWantsBack || canGoBack;
    if (cb.isEnabled() != enabled) {
      Log.i(TAG, "enabled=" + enabled + " canGoBack=" + canGoBack + " webWantsBack=" + webWantsBack);
      cb.setEnabled(enabled);
    }
  }
}
