package com.dibay.app;

import android.graphics.Bitmap;
import android.net.http.SslError;
import android.os.Build;
import android.util.Log;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Capacitor {@link BridgeWebViewClient} + DiBaY WebView load diagnostics (logcat).
 * Main-frame failures surface retry UI via {@link MainActivity}.
 */
public final class DibayBridgeWebViewClient extends BridgeWebViewClient {
  private static final String TAG = "DIBAY_WebView";

  public interface LoadMonitor {
    void onMainFramePageStarted(String url);

    void onMainFramePageFinished(String url);

    void onMainFrameLoadFailed(String url, String reason);
  }

  private final LoadMonitor loadMonitor;

  public DibayBridgeWebViewClient(Bridge bridge, LoadMonitor loadMonitor) {
    super(bridge);
    this.loadMonitor = loadMonitor;
  }

  @Override
  public void onPageStarted(WebView view, String url, Bitmap favicon) {
    Log.i(TAG, "webview_page_started url=" + safeUrl(url));
    super.onPageStarted(view, url, favicon);
    if (isMainFrameUrl(url)) {
      loadMonitor.onMainFramePageStarted(url);
    }
  }

  @Override
  public void onPageFinished(WebView view, String url) {
    Log.i(TAG, "webview_page_finished url=" + safeUrl(url) + " progress=" + view.getProgress());
    super.onPageFinished(view, url);
    if (isMainFrameUrl(url)) {
      loadMonitor.onMainFramePageFinished(url);
    }
  }

  @Override
  public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
    if (request != null && request.isForMainFrame()) {
      String url = request.getUrl() != null ? request.getUrl().toString() : view.getUrl();
      String reason = formatResourceError(error);
      Log.e(TAG, "webview_received_error url=" + safeUrl(url) + " reason=" + reason);
      loadMonitor.onMainFrameLoadFailed(url, reason);
    } else if (request != null && request.getUrl() != null) {
      Log.w(
          TAG,
          "webview_subresource_error url="
              + safeUrl(request.getUrl().toString())
              + " reason="
              + formatResourceError(error));
    }
    super.onReceivedError(view, request, error);
  }

  @Override
  public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
    if (request != null && request.isForMainFrame()) {
      String url = request.getUrl() != null ? request.getUrl().toString() : view.getUrl();
      int status = errorResponse != null ? errorResponse.getStatusCode() : 0;
      String reason = "HTTP_" + status;
      Log.e(TAG, "webview_received_http_error url=" + safeUrl(url) + " status=" + status);
      if (status >= 500 || status == 404) {
        loadMonitor.onMainFrameLoadFailed(url, reason);
      }
    }
    super.onReceivedHttpError(view, request, errorResponse);
  }

  @Override
  public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
    String url = error != null ? error.getUrl() : view.getUrl();
    String sslDetail = error != null ? String.valueOf(error.getPrimaryError()) : "unknown";
    Log.e(TAG, "webview_ssl_error url=" + safeUrl(url) + " primaryError=" + sslDetail);
    loadMonitor.onMainFrameLoadFailed(url, "SSL_ERROR_" + sslDetail);
    super.onReceivedSslError(view, handler, error);
  }

  private static boolean isMainFrameUrl(String url) {
    if (url == null || url.isEmpty()) return false;
    return !url.startsWith("about:") && !url.startsWith("data:");
  }

  private static String safeUrl(String url) {
    return url != null ? url : "";
  }

  private static String formatResourceError(WebResourceError error) {
    if (error == null) return "unknown";
    int code = error.getErrorCode();
    String desc = error.getDescription() != null ? error.getDescription().toString() : "";
    return mapNetError(code) + (desc.isEmpty() ? "" : " desc=" + desc);
  }

  /** Android WebView error codes → Chromium net::ERR_* names for logcat filtering. */
  private static String mapNetError(int code) {
    switch (code) {
      case WebViewClient_ERROR_HOST_LOOKUP:
        return "net::ERR_NAME_NOT_RESOLVED";
      case WebViewClient_ERROR_CONNECT:
        return "net::ERR_CONNECTION_REFUSED";
      case WebViewClient_ERROR_TIMEOUT:
        return "net::ERR_TIMED_OUT";
      case WebViewClient_ERROR_FAILED_SSL_HANDSHAKE:
        return "net::ERR_SSL_PROTOCOL_ERROR";
      case WebViewClient_ERROR_PROXY_AUTHENTICATION:
        return "net::ERR_PROXY_AUTH_REQUESTED";
      case WebViewClient_ERROR_AUTHENTICATION:
        return "net::ERR_INVALID_AUTH_CREDENTIALS";
      case WebViewClient_ERROR_IO:
        return "net::ERR_CONNECTION_RESET";
      case WebViewClient_ERROR_REDIRECT_LOOP:
        return "net::ERR_TOO_MANY_REDIRECTS";
      case WebViewClient_ERROR_UNSUPPORTED_SCHEME:
        return "net::ERR_UNKNOWN_URL_SCHEME";
      case WebViewClient_ERROR_FILE:
        return "net::ERR_FILE_NOT_FOUND";
      case WebViewClient_ERROR_FILE_NOT_FOUND:
        return "net::ERR_FILE_NOT_FOUND";
      case WebViewClient_ERROR_TOO_MANY_REQUESTS:
        return "net::ERR_INSUFFICIENT_RESOURCES";
      case WebViewClient_ERROR_UNSAFE_RESOURCE:
        return "net::ERR_UNSAFE_RESOURCE";
      case WebViewClient_ERROR_BAD_URL:
        return "net::ERR_INVALID_URL";
      default:
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          return "net::ERR_FAILED(code=" + code + ")";
        }
        return "net::ERR_FAILED(code=" + code + ")";
    }
  }

  private static final int WebViewClient_ERROR_HOST_LOOKUP = -2;
  private static final int WebViewClient_ERROR_CONNECT = -6;
  private static final int WebViewClient_ERROR_TIMEOUT = -8;
  private static final int WebViewClient_ERROR_REDIRECT_LOOP = -9;
  private static final int WebViewClient_ERROR_UNSUPPORTED_SCHEME = -10;
  private static final int WebViewClient_ERROR_FAILED_SSL_HANDSHAKE = -11;
  private static final int WebViewClient_ERROR_BAD_URL = -12;
  private static final int WebViewClient_ERROR_FILE = -13;
  private static final int WebViewClient_ERROR_FILE_NOT_FOUND = -14;
  private static final int WebViewClient_ERROR_TOO_MANY_REQUESTS = -15;
  private static final int WebViewClient_ERROR_UNSAFE_RESOURCE = -16;
  private static final int WebViewClient_ERROR_AUTHENTICATION = -4;
  private static final int WebViewClient_ERROR_PROXY_AUTHENTICATION = -5;
  private static final int WebViewClient_ERROR_IO = -7;
}
