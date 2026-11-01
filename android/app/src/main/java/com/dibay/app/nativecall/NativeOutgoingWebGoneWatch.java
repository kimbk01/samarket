package com.dibay.app.nativecall;

import android.content.Context;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.CookieManager;
import com.dibay.app.DibayServerOrigin;
import com.dibay.app.IncomingCallTerminalHandler;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import com.dibay.app.nativevoice.NativeVoiceCallRuntime;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONObject;

/**
 * 웹 화면(렌더러)이 죽은 동안만 도는 네이티브 발신 감시 (android-caller-stuck-after-remote-missed-design §12-2).
 *
 * <p>Android 발신의 서버 종료 감지는 웹 조회(native-outgoing-terminal-sync.ts)와 종료 푸시뿐이다. 렌더러가 죽어
 * 웹이 없고 푸시도 유실되면 발신 화면이 닫히지 않으므로, 그때에만 같은 세션 조회 API 로 서버 상태를 본다.
 * 종료는 종료 푸시와 같은 {@link IncomingCallTerminalHandler} 경로로만 전달한다(통화 상태를 직접 바꾸지 않음).
 */
public final class NativeOutgoingWebGoneWatch {
  private static final String TAG = "DIBAY_CALL";
  private static final String SOURCE = "native_outgoing_web_gone_watch";
  private static final Map<String, Long> ACTIVE = new ConcurrentHashMap<>();
  private static volatile Handler handler;

  private NativeOutgoingWebGoneWatch() {}

  /** 렌더러가 죽은 순간 연결 전 발신 통화마다 1번 시작. 같은 통화는 중복 시작하지 않는다. */
  public static void startForEstablishingOutgoing(Context context) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    for (String sid : NativeVoiceCallRuntime.outgoingEstablishingCallIds()) start(app, sid);
    for (String sid : NativeVideoCallRuntime.outgoingEstablishingCallIds()) start(app, sid);
  }

  private static void start(Context app, String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    long startedAt = SystemClock.elapsedRealtime();
    if (ACTIVE.putIfAbsent(sid, startedAt) != null) return;
    Log.i(TAG, "[DIBAY_CALL] outgoing_web_gone_watch_start callId=" + sid);
    handler().post(() -> tick(app, sid, startedAt));
  }

  private static Handler handler() {
    Handler h = handler;
    if (h != null) return h;
    synchronized (NativeOutgoingWebGoneWatch.class) {
      if (handler == null) {
        HandlerThread thread = new HandlerThread("dibay-outgoing-web-gone-watch");
        thread.start();
        handler = new Handler(thread.getLooper());
      }
      return handler;
    }
  }

  private static boolean isCurrent(String sid, long startedAt) {
    Long active = ACTIVE.get(sid);
    return active != null && active == startedAt;
  }

  private static boolean stillOutgoingEstablishing(String sid) {
    return NativeVoiceCallRuntime.outgoingEstablishingCallIds().contains(sid)
        || NativeVideoCallRuntime.outgoingEstablishingCallIds().contains(sid);
  }

  private static void tick(Context app, String sid, long startedAt) {
    if (!isCurrent(sid, startedAt)) return;
    long elapsed = SystemClock.elapsedRealtime() - startedAt;
    boolean establishing = stillOutgoingEstablishing(sid);
    int httpStatus = 0;
    String status = null;
    if (establishing) {
      String[] out = fetchSessionStatus(app, sid);
      httpStatus = Integer.parseInt(out[0]);
      status = out[1];
    }
    NativeOutgoingWebGoneWatchPolicy.Decision decision =
        NativeOutgoingWebGoneWatchPolicy.decide(elapsed, establishing, httpStatus, status);
    switch (decision.kind) {
      case TERMINAL:
        ACTIVE.remove(sid, startedAt);
        Log.i(
            TAG,
            "[DIBAY_CALL] outgoing_web_gone_watch_terminal callId="
                + sid
                + " status="
                + status
                + " elapsedMs="
                + elapsed);
        IncomingCallTerminalHandler.handle(app, sid, status, SOURCE);
        return;
      case STOP:
        ACTIVE.remove(sid, startedAt);
        Log.i(
            TAG,
            "[DIBAY_CALL] outgoing_web_gone_watch_stop callId="
                + sid
                + " reason="
                + decision.reason
                + " elapsedMs="
                + elapsed);
        return;
      case CONTINUE:
      default:
        handler().postDelayed(() -> tick(app, sid, startedAt), decision.delayMs);
    }
  }

  /** {@code [httpStatus, sessionStatus]} — 웹 발신 조회와 같은 GET (쿠키 인증 · 캐시 없음). */
  private static String[] fetchSessionStatus(Context app, String sid) {
    HttpURLConnection conn = null;
    try {
      String origin = DibayServerOrigin.resolve(app);
      if (origin == null || origin.isEmpty()) return new String[] {"0", null};
      URL url =
          new URL(
              origin
                  + "/api/community-messenger/calls/sessions/"
                  + URLEncoder.encode(sid, "UTF-8")
                  + "?ts="
                  + System.currentTimeMillis());
      conn = (HttpURLConnection) url.openConnection();
      conn.setConnectTimeout(8_000);
      conn.setReadTimeout(8_000);
      conn.setRequestMethod("GET");
      conn.setRequestProperty("Accept", "application/json");
      conn.setRequestProperty("Cache-Control", "no-cache");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
      int code = conn.getResponseCode();
      if (code < 200 || code >= 300) return new String[] {String.valueOf(code), null};
      String body = readBody(conn.getInputStream());
      JSONObject json = body.isEmpty() ? new JSONObject() : new JSONObject(body);
      JSONObject session = json.optJSONObject("session");
      String status = session != null ? session.optString("status", "") : "";
      String id = session != null ? session.optString("id", "") : "";
      if (!id.isEmpty() && !sid.equals(id.trim())) return new String[] {"0", null};
      return new String[] {String.valueOf(code), status.isEmpty() ? null : status};
    } catch (Exception error) {
      Log.w(
          TAG,
          "[DIBAY_CALL] outgoing_web_gone_watch_fetch_failed callId="
              + sid
              + " error="
              + error.getClass().getSimpleName());
      return new String[] {"0", null};
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static String readBody(InputStream stream) throws Exception {
    if (stream == null) return "";
    try (BufferedReader reader =
        new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
      StringBuilder out = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null) out.append(line);
      return out.toString();
    }
  }
}
