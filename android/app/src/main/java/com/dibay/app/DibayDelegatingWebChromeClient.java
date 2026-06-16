package com.dibay.app;

import android.graphics.Bitmap;
import android.net.Uri;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

/**
 * Capacitor {@link WebChromeClient} 위임 + DiBaY 미디어·위치 WebView 권한 처리.
 */
public final class DibayDelegatingWebChromeClient extends WebChromeClient {

  private final WebChromeClient delegate;
  private final DibayWebViewPermissionDelegate permissionDelegate;

  public DibayDelegatingWebChromeClient(WebChromeClient delegate, DibayWebViewPermissionDelegate permissionDelegate) {
    this.delegate = delegate;
    this.permissionDelegate = permissionDelegate;
  }

  @Override
  public void onPermissionRequest(PermissionRequest request) {
    permissionDelegate.onPermissionRequest(request);
  }

  @Override
  public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
    permissionDelegate.onGeolocationPermissionsShowPrompt(origin, callback);
  }

  @Override
  public void onProgressChanged(WebView view, int newProgress) {
    if (delegate != null) delegate.onProgressChanged(view, newProgress);
    else super.onProgressChanged(view, newProgress);
  }

  @Override
  public void onReceivedTitle(WebView view, String title) {
    if (delegate != null) delegate.onReceivedTitle(view, title);
    else super.onReceivedTitle(view, title);
  }

  @Override
  public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
    String msg = consoleMessage.message();
    if (msg != null && msg.contains("DIBAY_PUSH_REGISTER")) {
      int level = msg.contains("_FAIL") ? android.util.Log.ERROR : android.util.Log.INFO;
      android.util.Log.println(level, "DIBAY_PUSH_REGISTER", msg);
    }
    if (msg != null && msg.contains("incoming_presenter_decision")) {
      android.util.Log.i("DIBAY_CALL", msg.trim());
    }
    if (delegate != null) return delegate.onConsoleMessage(consoleMessage);
    return super.onConsoleMessage(consoleMessage);
  }

  @Override
  public boolean onShowFileChooser(
    WebView webView,
    ValueCallback<Uri[]> filePathCallback,
    FileChooserParams fileChooserParams
  ) {
    if (delegate != null) return delegate.onShowFileChooser(webView, filePathCallback, fileChooserParams);
    return super.onShowFileChooser(webView, filePathCallback, fileChooserParams);
  }

  @Override
  public void onShowCustomView(View view, CustomViewCallback callback) {
    if (delegate != null) delegate.onShowCustomView(view, callback);
    else super.onShowCustomView(view, callback);
  }

  @Override
  public void onHideCustomView() {
    if (delegate != null) delegate.onHideCustomView();
    else super.onHideCustomView();
  }

  @Override
  public View getVideoLoadingProgressView() {
    if (delegate != null) return delegate.getVideoLoadingProgressView();
    return super.getVideoLoadingProgressView();
  }

  @Override
  public Bitmap getDefaultVideoPoster() {
    if (delegate != null) return delegate.getDefaultVideoPoster();
    return super.getDefaultVideoPoster();
  }
}
