package com.dibay.app.nativecall;

import android.content.Context;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.CookieManager;
import android.widget.Toast;
import com.dibay.app.DibayServerOrigin;
import com.dibay.app.IncomingCallTerminalHandler;
import com.dibay.app.R;
import com.dibay.app.nativevideo.NativeVideoCallApi;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import com.dibay.app.nativevoice.NativeVoiceCallApi;
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
 *
 * <p>서버 통화 id 를 넘겨받기 전(발신 준비 PREPARING)에 웹이 죽으면 네이티브는 서버 통화를 모른다(§14 #13). 그때는
 * 본인 live 통화 조회({@code /calls/sessions/active?scope=live})로 같은 방·본인 발신·울리는 중 통화를 찾아 취소하고
 * 준비 화면을 닫는다({@link NativeOutgoingPreparingWebGonePolicy}).
 */
public final class NativeOutgoingWebGoneWatch {
  private static final String TAG = "DIBAY_CALL";
  private static final String SOURCE = "native_outgoing_web_gone_watch";
  private static final String PREPARING_KEY_PREFIX = "preparing:";
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
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

  /**
   * 렌더러가 죽은 순간 서버 통화 id 를 받기 전인 발신 준비(열려 있거나 15초 안에 닫힌 것)마다 1번 시작.
   * 같은 준비는 중복 시작하지 않는다.
   */
  public static void startForPreparingOutgoing(Context context) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    startPreparing(app, NativeVoiceCallRuntime.preparingOutgoing());
    startPreparing(app, NativeVideoCallRuntime.preparingOutgoing());
    // 직전에 사용자가 준비 화면을 닫았는데(서버 취소는 웹 몫) 웹이 처리 전에 죽었으면 남은 서버 통화를 이어서 취소한다.
    long window = NativeOutgoingPreparingWebGonePolicy.WINDOW_MS;
    startPreparing(app, NativeVoiceCallRuntime.recentlyAbandonedPreparing(window));
    startPreparing(app, NativeVideoCallRuntime.recentlyAbandonedPreparing(window));
  }

  private static void startPreparing(Context app, NativeOutgoingPreparingSnapshot snap) {
    if (snap == null || snap.attemptId == null || snap.attemptId.trim().isEmpty()) return;
    String key = PREPARING_KEY_PREFIX + snap.attemptId.trim();
    long startedAt = SystemClock.elapsedRealtime();
    if (ACTIVE.putIfAbsent(key, startedAt) != null) return;
    Log.i(
        TAG,
        "[DIBAY_CALL] outgoing_preparing_web_gone_watch_start attemptId="
            + snap.attemptId
            + " media="
            + snap.media
            + " roomId="
            + snap.roomId);
    handler().post(() -> tickPreparing(app, snap, key, startedAt));
  }

  /** 이 준비 말고 네이티브에 다른 발신(새 준비 또는 서버 id 를 받은 연결 전 발신)이 있는지. */
  private static boolean otherOutgoingLive(NativeOutgoingPreparingSnapshot snap) {
    NativeOutgoingPreparingSnapshot voice = NativeVoiceCallRuntime.preparingOutgoing();
    NativeOutgoingPreparingSnapshot video = NativeVideoCallRuntime.preparingOutgoing();
    if (voice != null && !snap.attemptId.equals(voice.attemptId)) return true;
    if (video != null && !snap.attemptId.equals(video.attemptId)) return true;
    return !NativeVoiceCallRuntime.outgoingEstablishingCallIds().isEmpty()
        || !NativeVideoCallRuntime.outgoingEstablishingCallIds().isEmpty();
  }

  /** 네이티브가 이미 아는(서버 id 로 열린) 통화면 이 준비의 고아 통화가 아니다. */
  private static boolean nativeKnowsCall(String callId) {
    return NativeVoiceCallRuntime.getSession(callId) != null
        || NativeVideoCallRuntime.getSession(callId) != null;
  }

  private static boolean stillPreparing(NativeOutgoingPreparingSnapshot snap) {
    return "video".equals(snap.media)
        ? NativeVideoCallRuntime.isPreparing(snap.attemptId)
        : NativeVoiceCallRuntime.isPreparing(snap.attemptId);
  }

  private static void tickPreparing(
      Context app, NativeOutgoingPreparingSnapshot snap, String key, long startedAt) {
    if (!isCurrent(key, startedAt)) return;
    long elapsed = SystemClock.elapsedRealtime() - startedAt;
    boolean preparing = stillPreparing(snap);
    boolean otherOutgoing = otherOutgoingLive(snap);
    int httpStatus = 0;
    boolean matched = false;
    String sessionId = null;
    if (preparing || !otherOutgoing) {
      HttpJson res = httpGetJson(app, "/api/community-messenger/calls/sessions/active?scope=live");
      httpStatus = res.code;
      JSONObject session = res.body != null ? res.body.optJSONObject("session") : null;
      if (session != null) {
        String id = session.optString("id", "").trim();
        matched =
            !id.isEmpty()
                && !nativeKnowsCall(id)
                && NativeOutgoingPreparingWebGonePolicy.matches(
                    snap.roomId,
                    snap.startedAtWallMs,
                    session.optString("roomId", ""),
                    session.optBoolean("isMineInitiator", false),
                    session.optString("status", ""),
                    NativeOutgoingPreparingWebGonePolicy.parseIsoMs(session.optString("startedAt", "")));
        if (matched) sessionId = id;
      }
    }
    NativeOutgoingPreparingWebGonePolicy.Decision decision =
        NativeOutgoingPreparingWebGonePolicy.decide(
            elapsed, preparing, otherOutgoing, httpStatus, matched);
    switch (decision.kind) {
      case CANCEL_SESSION:
        {
          ACTIVE.remove(key, startedAt);
          String sid = sessionId;
          Log.i(
              TAG,
              "[DIBAY_CALL] outgoing_preparing_web_gone_cancel attemptId="
                  + snap.attemptId
                  + " callId="
                  + sid
                  + " elapsedMs="
                  + elapsed);
          // 발신자가 울리는 중 통화에 end → 서버가 cancelled 로 확정(네이티브 종료 버튼과 같은 PATCH).
          if ("video".equals(snap.media)) {
            NativeVideoCallApi.endAsync(
                app, sid, (ok, status, error) -> onPreparingSessionEnded(app, snap, sid, ok, status));
          } else {
            NativeVoiceCallApi.endAsync(
                app, sid, (ok, status, error) -> onPreparingSessionEnded(app, snap, sid, ok, status));
          }
          return;
        }
      case CLOSE_ONLY:
        ACTIVE.remove(key, startedAt);
        Log.i(
            TAG,
            "[DIBAY_CALL] outgoing_preparing_web_gone_close attemptId="
                + snap.attemptId
                + " reason="
                + decision.reason
                + " elapsedMs="
                + elapsed);
        closePreparing(app, snap, "renderer_gone_" + decision.reason);
        return;
      case STOP:
        ACTIVE.remove(key, startedAt);
        Log.i(
            TAG,
            "[DIBAY_CALL] outgoing_preparing_web_gone_watch_stop attemptId="
                + snap.attemptId
                + " reason="
                + decision.reason
                + " elapsedMs="
                + elapsed);
        return;
      case CONTINUE:
      default:
        handler().postDelayed(() -> tickPreparing(app, snap, key, startedAt), decision.delayMs);
    }
  }

  private static void onPreparingSessionEnded(
      Context app, NativeOutgoingPreparingSnapshot snap, String sid, boolean ok, int status) {
    Log.i(
        TAG,
        "[DIBAY_CALL] outgoing_preparing_web_gone_cancel_result attemptId="
            + snap.attemptId
            + " callId="
            + sid
            + " ok="
            + ok
            + " status="
            + status);
    closePreparing(app, snap, "renderer_gone_session_cancelled");
  }

  /** 준비 화면을 기존 abandon 경로로 닫고, 기존 「통화를 시작하지 못했습니다」 안내를 한 번 보인다. */
  private static void closePreparing(
      Context app, NativeOutgoingPreparingSnapshot snap, String source) {
    MAIN.post(
        () -> {
          if (!stillPreparing(snap)) return;
          if ("video".equals(snap.media)) {
            NativeVideoCallRuntime.abandonPreparingFromUi(app, snap.attemptId, source);
          } else {
            NativeVoiceCallRuntime.abandonPreparingFromUi(app, snap.attemptId, source);
          }
          Toast.makeText(app, R.string.dibay_call_notice_call_failed, Toast.LENGTH_LONG).show();
        });
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
    String path;
    try {
      path = "/api/community-messenger/calls/sessions/" + URLEncoder.encode(sid, "UTF-8");
    } catch (Exception e) {
      return new String[] {"0", null};
    }
    HttpJson res = httpGetJson(app, path);
    if (res.code < 200 || res.code >= 300 || res.body == null) {
      return new String[] {String.valueOf(res.code), null};
    }
    JSONObject session = res.body.optJSONObject("session");
    String status = session != null ? session.optString("status", "") : "";
    String id = session != null ? session.optString("id", "") : "";
    if (!id.isEmpty() && !sid.equals(id.trim())) return new String[] {"0", null};
    return new String[] {String.valueOf(res.code), status.isEmpty() ? null : status};
  }

  private static final class HttpJson {
    final int code;
    final JSONObject body;

    HttpJson(int code, JSONObject body) {
      this.code = code;
      this.body = body;
    }
  }

  /** 앱 서버 GET (WebView 쿠키 인증 · 캐시 없음). 실패는 code 0, 2xx 가 아니면 body null. */
  private static HttpJson httpGetJson(Context app, String pathAndQuery) {
    HttpURLConnection conn = null;
    try {
      String origin = DibayServerOrigin.resolve(app);
      if (origin == null || origin.isEmpty()) return new HttpJson(0, null);
      String sep = pathAndQuery.contains("?") ? "&" : "?";
      URL url = new URL(origin + pathAndQuery + sep + "ts=" + System.currentTimeMillis());
      conn = (HttpURLConnection) url.openConnection();
      conn.setConnectTimeout(8_000);
      conn.setReadTimeout(8_000);
      conn.setRequestMethod("GET");
      conn.setRequestProperty("Accept", "application/json");
      conn.setRequestProperty("Cache-Control", "no-cache");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
      int code = conn.getResponseCode();
      if (code < 200 || code >= 300) return new HttpJson(code, null);
      String body = readBody(conn.getInputStream());
      return new HttpJson(code, body.isEmpty() ? new JSONObject() : new JSONObject(body));
    } catch (Exception error) {
      Log.w(
          TAG,
          "[DIBAY_CALL] outgoing_web_gone_watch_fetch_failed path="
              + pathAndQuery
              + " error="
              + error.getClass().getSimpleName());
      return new HttpJson(0, null);
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
