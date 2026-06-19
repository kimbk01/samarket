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
 * Edge-to-edge WebView safe-area — injects {@code --dibay-safe-*} CSS variables on {@code
 * document.documentElement}.
 *
 * <p>Navigation bar insets go to {@code --dibay-safe-bottom}. IME is excluded from safe-bottom and
 * is published separately via {@code window.samarketShell.keyboardBottomInsetCssPx} (web keyboard
 * contract).
 */
public final class DibayWebSafeAreaBridge {
  private static final String TAG = "DIBAY_SafeArea";

  private final BridgeActivity activity;
  private volatile int lastTopCss = -1;
  private volatile int lastBottomCss = -1;
  private volatile int lastLeftCss = -1;
  private volatile int lastRightCss = -1;
  private volatile int lastKeyboardCss = -1;
  private volatile boolean attached = false;

  public DibayWebSafeAreaBridge(BridgeActivity activity) {
    this.activity = activity;
  }

  /** Call from {@link MainActivity#onCreate} after {@code super.onCreate}. */
  public void attach() {
    if (attached) return;
    attached = true;
    WindowCompat.setDecorFitsSystemWindows(activity.getWindow(), false);
    View decor = activity.getWindow().getDecorView();
    ViewCompat.setOnApplyWindowInsetsListener(
        decor,
        (view, insets) -> {
          publishInsets(insets);
          return insets;
        });
    ViewCompat.requestApplyInsets(decor);
    Log.i(TAG, "safe_area_bridge_attached");
  }

  /** Re-inject after WebView page load or resume when bridge is ready. */
  public void refreshIfPossible() {
    forceRefresh();
  }

  private void publishInsets(WindowInsetsCompat insets) {
    Insets statusCutout =
        insets.getInsets(
            WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
    Insets navCutout =
        insets.getInsets(
            WindowInsetsCompat.Type.navigationBars()
                | WindowInsetsCompat.Type.systemGestures()
                | WindowInsetsCompat.Type.displayCutout());
    Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());

    float density = activity.getResources().getDisplayMetrics().density;
    int topCss = toCssPx(statusCutout.top, density);
    int bottomCss = toCssPx(navCutout.bottom, density);
    int leftCss = toCssPx(Math.max(statusCutout.left, navCutout.left), density);
    int rightCss = toCssPx(Math.max(statusCutout.right, navCutout.right), density);
    int keyboardCss = toCssPx(ime.bottom, density);

    boolean unchanged =
        topCss == lastTopCss
            && bottomCss == lastBottomCss
            && leftCss == lastLeftCss
            && rightCss == lastRightCss
            && keyboardCss == lastKeyboardCss;

    if (unchanged && lastTopCss >= 0) {
      return;
    }

    if (!injectToWebView(topCss, bottomCss, leftCss, rightCss, keyboardCss)) {
      return;
    }

    lastTopCss = topCss;
    lastBottomCss = bottomCss;
    lastLeftCss = leftCss;
    lastRightCss = rightCss;
    lastKeyboardCss = keyboardCss;

    Log.d(
        TAG,
        "insets_css top="
            + topCss
            + " bottom="
            + bottomCss
            + " left="
            + leftCss
            + " right="
            + rightCss
            + " keyboard="
            + keyboardCss);
  }

  /** Re-inject after page load — bypass dedupe when WebView may have missed first inject. */
  public void forceRefresh() {
    View decor = activity.getWindow().getDecorView();
    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
    if (insets == null) return;

    Insets statusCutout =
        insets.getInsets(
            WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
    Insets navCutout =
        insets.getInsets(
            WindowInsetsCompat.Type.navigationBars()
                | WindowInsetsCompat.Type.systemGestures()
                | WindowInsetsCompat.Type.displayCutout());
    Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
    float density = activity.getResources().getDisplayMetrics().density;
    int topCss = toCssPx(statusCutout.top, density);
    int bottomCss = toCssPx(navCutout.bottom, density);
    int leftCss = toCssPx(Math.max(statusCutout.left, navCutout.left), density);
    int rightCss = toCssPx(Math.max(statusCutout.right, navCutout.right), density);
    int keyboardCss = toCssPx(ime.bottom, density);

    if (injectToWebView(topCss, bottomCss, leftCss, rightCss, keyboardCss)) {
      lastTopCss = topCss;
      lastBottomCss = bottomCss;
      lastLeftCss = leftCss;
      lastRightCss = rightCss;
      lastKeyboardCss = keyboardCss;
    }
  }

  private boolean injectToWebView(
      int topCss, int bottomCss, int leftCss, int rightCss, int keyboardCss) {
    Bridge bridge = activity.getBridge();
    if (bridge == null) return false;
    WebView webView = bridge.getWebView();
    if (webView == null) return false;

    final String js =
        "(function(){try{var r=document.documentElement;"
            + "r.style.setProperty('--dibay-safe-top','"
            + topCss
            + "px');"
            + "r.style.setProperty('--dibay-safe-bottom','"
            + bottomCss
            + "px');"
            + "r.style.setProperty('--dibay-safe-left','"
            + leftCss
            + "px');"
            + "r.style.setProperty('--dibay-safe-right','"
            + rightCss
            + "px');"
            + "window.samarketShell=window.samarketShell||{};"
            + "window.samarketShell.keyboardBottomInsetCssPx="
            + keyboardCss
            + ";"
            + "window.dispatchEvent(new CustomEvent('samarket:shell-keyboard',{detail:{bottomInsetCssPx:"
            + keyboardCss
            + "}}));"
            + "}catch(e){}})();";

    webView.post(() -> webView.evaluateJavascript(js, null));
    return true;
  }

  private static int toCssPx(int insetPx, float density) {
    if (insetPx <= 0) return 0;
    if (density <= 0f) return insetPx;
    return Math.max(0, Math.round(insetPx / density));
  }
}
