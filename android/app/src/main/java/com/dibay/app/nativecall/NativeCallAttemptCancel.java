package com.dibay.app.nativecall;

import android.content.Context;
import android.util.Log;
import android.webkit.CookieManager;
import com.dibay.app.DibayServerOrigin;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 발신 시도 취소 — android-caller-stuck-after-remote-missed-design §15-4 (5).
 *
 * <p>서버 통화 id 를 받기 전(발신 준비 PREPARING)에 시도를 그만두면 네이티브가 서버에 직접 알린다. 서버는 그 시도로
 * 이미 만든 통화가 울리는 중이면 취소하고, 아직 없으면 이후 생성이 통화를 만들지 않는다. 웹이 살아 있든 죽었든 같은
 * 결과가 되도록 웹 이벤트와 별개로 보낸다. 멱등이라 웹이 같은 시도를 함께 취소해도 결과는 같다.
 */
public final class NativeCallAttemptCancel {
  private static final String TAG = "DIBAY_CALL";
  private static final long[] RETRY_DELAYS_MS = {0L, 1_000L, 3_000L};
  private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

  private NativeCallAttemptCancel() {}

  public static void cancelAsync(Context context, String attemptId, String reason) {
    if (context == null || attemptId == null || attemptId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String aid = attemptId.trim();
    String why = reason != null ? reason : "";
    Log.i(TAG, "[DIBAY_CALL] attempt_cancel_start attemptId=" + aid + " reason=" + why);
    EXECUTOR.execute(() -> run(app, aid, why));
  }

  private static void run(Context app, String aid, String reason) {
    int code = 0;
    for (long delay : RETRY_DELAYS_MS) {
      if (delay > 0) {
        try {
          Thread.sleep(delay);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          break;
        }
      }
      code = post(app, aid);
      if (code >= 200 && code < 300) break;
      // 4xx(429 제외)는 다시 보내도 같다.
      if (code >= 400 && code < 500 && code != 429) break;
    }
    Log.i(
        TAG,
        "[DIBAY_CALL] attempt_cancel_done attemptId=" + aid + " reason=" + reason + " status=" + code);
  }

  /** @return HTTP 코드, 실패 0 */
  private static int post(Context app, String aid) {
    HttpURLConnection conn = null;
    try {
      String origin = DibayServerOrigin.resolve(app);
      if (origin == null || origin.isEmpty()) return 0;
      URL url =
          new URL(
              origin
                  + "/api/community-messenger/calls/attempts/"
                  + URLEncoder.encode(aid, "UTF-8")
                  + "/cancel");
      conn = (HttpURLConnection) url.openConnection();
      conn.setConnectTimeout(8_000);
      conn.setReadTimeout(8_000);
      conn.setRequestMethod("POST");
      conn.setDoOutput(true);
      conn.setRequestProperty("Accept", "application/json");
      conn.setRequestProperty("Content-Type", "application/json");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
      conn.getOutputStream().write("{}".getBytes("UTF-8"));
      return conn.getResponseCode();
    } catch (Exception error) {
      Log.w(
          TAG,
          "[DIBAY_CALL] attempt_cancel_failed attemptId="
              + aid
              + " error="
              + error.getClass().getSimpleName());
      return 0;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }
}
