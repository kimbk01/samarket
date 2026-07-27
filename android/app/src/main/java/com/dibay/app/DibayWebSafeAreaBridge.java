package com.dibay.app;

import android.util.Log;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Main WebView safe-area SSOT — injects {@code --dibay-safe-*} on {@code document.documentElement}.
 * Web layer: {@code app/app-shell.css} {@code --safe-* = max(env, var(--dibay-safe-*))}.
 * Does not modify WebView padding (CSS variables only).
 *
 * Bottom layout padding uses {@link #BOTTOM_LAYOUT_INSET_TYPES} only — actual navigation
 * chrome (+ display cutout). Gesture exclusion ({@code systemGestures}/
 * {@code mandatorySystemGestures}) and {@code tappableElement} are not layout padding.
 * Top/left/right keep the legacy edge mask. IME is not consumed here (Keyboard Adapter).
 */
public final class DibayWebSafeAreaBridge {
  private static final String TAG = "DIBAY_SafeArea";

  /** Top / left / right — unchanged legacy edge mask. */
  private static final int EDGE_INSET_TYPES =
      WindowInsetsCompat.Type.systemBars()
          | WindowInsetsCompat.Type.systemGestures()
          | WindowInsetsCompat.Type.displayCutout();

  /**
   * Bottom layout padding for Composer / BottomNav / {@code --safe-bottom}.
   * Navigation chrome only — not gesture exclusion, not tappableElement.
   */
  private static final int BOTTOM_LAYOUT_INSET_TYPES =
      WindowInsetsCompat.Type.navigationBars() | WindowInsetsCompat.Type.displayCutout();

  private static volatile int lastTopCss;
  private static volatile int lastBottomCss;
  private static volatile int lastLeftCss;
  private static volatile int lastRightCss;

  private DibayWebSafeAreaBridge() {}

  /** Call once from {@link MainActivity#onCreate} after {@code super.onCreate}. */
  public static void attach(BridgeActivity activity) {
    if (activity == null || activity.getWindow() == null) return;
    WindowCompat.setDecorFitsSystemWindows(activity.getWindow(), false);
    View decor = activity.getWindow().getDecorView();
    ViewCompat.setOnApplyWindowInsetsListener(
        decor,
        (view, windowInsets) -> {
          applyInsets(activity, windowInsets);
          return windowInsets;
        });
    requestInsetsSync(activity);
  }

  /** Re-inject after resume / rotation when WebView may have been recreated. */
  public static void syncIfPossible(BridgeActivity activity) {
    if (activity == null || activity.getWindow() == null) return;
    View decor = activity.getWindow().getDecorView();
    WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(decor);
    if (windowInsets != null) {
      applyInsets(activity, windowInsets);
      return;
    }
    injectCachedSafeAreaCss(activity);
  }

  public static void requestInsetsSync(BridgeActivity activity) {
    if (activity == null || activity.getWindow() == null) return;
    ViewCompat.requestApplyInsets(activity.getWindow().getDecorView());
  }

  private static void applyInsets(BridgeActivity activity, WindowInsetsCompat windowInsets) {
    Insets edge = windowInsets.getInsets(EDGE_INSET_TYPES);
    Insets bottomLayout = windowInsets.getInsets(BOTTOM_LAYOUT_INSET_TYPES);
    float density = activity.getResources().getDisplayMetrics().density;
    lastTopCss = pxToCssPx(edge.top, density);
    lastLeftCss = pxToCssPx(edge.left, density);
    lastRightCss = pxToCssPx(edge.right, density);
    lastBottomCss = pxToCssPx(bottomLayout.bottom, density);
    Log.i(
        TAG,
        "insets_px top="
            + edge.top
            + " bottom="
            + bottomLayout.bottom
            + " left="
            + edge.left
            + " right="
            + edge.right
            + " css_top="
            + lastTopCss
            + " css_bottom="
            + lastBottomCss
            + " bottom_mask=navigationBars|displayCutout");
    injectCachedSafeAreaCss(activity);
  }

  private static int pxToCssPx(int px, float density) {
    if (px <= 0) return 0;
    if (density <= 0f) return px;
    return Math.max(0, Math.round(px / density));
  }

  private static void injectCachedSafeAreaCss(BridgeActivity activity) {
    Bridge bridge = activity.getBridge();
    if (bridge == null) return;
    WebView webView = bridge.getWebView();
    if (webView == null) return;
    final String js =
        "(function(){try{var r=document.documentElement;"
            + "r.style.setProperty('--dibay-safe-top','"
            + lastTopCss
            + "px');"
            + "r.style.setProperty('--dibay-safe-bottom','"
            + lastBottomCss
            + "px');"
            + "r.style.setProperty('--dibay-safe-left','"
            + lastLeftCss
            + "px');"
            + "r.style.setProperty('--dibay-safe-right','"
            + lastRightCss
            + "px');"
            + "}catch(e){}})();";
    webView.post(() -> webView.evaluateJavascript(js, null));
  }
}
