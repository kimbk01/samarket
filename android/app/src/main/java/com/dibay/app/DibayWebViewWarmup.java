package com.dibay.app;

import android.app.ActivityManager;
import android.content.Context;
import android.os.SystemClock;
import android.util.Log;
import androidx.annotation.OptIn;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewStartUpConfig;

/**
 * 첫 진입 C2 (docs/audit/cold-start-and-remaining-defects-final-design-2026-11-12.md §3):
 * WebView 엔진 적재(WebViewFactory, 샤오미 실측 0.31~0.39초)가 MainActivity 메인 스레드에서 일어나던 것을
 * 앱 프로세스 시작(Application.onCreate) 때 백그라운드 스레드에서 미리 시작해 ① 앱 코드 적재와 겹친다.
 *
 * <p>화면(아이콘·최근 앱)으로 시작한 프로세스에서만 한다. 푸시(FCM)·통화 수신으로 깨어난 프로세스는
 * 프로세스 중요도가 FOREGROUND 가 아니므로 아무것도 하지 않는다 — 통화 수신 경로 동작 무변경.
 * 메인 스레드는 기존대로 WebView 를 만든다(엔진 적재가 끝나지 않았으면 그 자리에서 기다릴 뿐 — 기존보다 늦지 않음).
 */
final class DibayWebViewWarmup {
  private static final String TAG = "DibayWebViewWarmup";

  private DibayWebViewWarmup() {}

  @OptIn(markerClass = WebViewCompat.ExperimentalAsyncStartUp.class)
  static void startIfLaunchedForUi(Context context) {
    final Context app = context.getApplicationContext();
    final ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
    try {
      ActivityManager.getMyMemoryState(info);
    } catch (RuntimeException error) {
      Log.w(TAG, "skip reason=memory_state_unavailable");
      return;
    }
    if (info.importance != ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
      Log.i(TAG, "skip reason=not_foreground importance=" + info.importance);
      return;
    }
    final long startedAt = SystemClock.uptimeMillis();
    try {
      WebViewStartUpConfig config =
          new WebViewStartUpConfig.Builder(
                  command -> {
                    Thread thread = new Thread(command, "dibay-webview-warmup");
                    thread.setDaemon(true);
                    thread.start();
                  })
              .setShouldRunUiThreadStartUpTasks(false)
              .build();
      WebViewCompat.startUpWebView(
          app,
          config,
          result ->
              Log.i(TAG, "done ms=" + (SystemClock.uptimeMillis() - startedAt)));
      Log.i(TAG, "started");
    } catch (RuntimeException | LinkageError error) {
      Log.w(TAG, "skip reason=" + error.getClass().getSimpleName());
    }
  }
}
