package com.dibay.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import android.webkit.CookieManager;
import java.io.OutputStream;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import com.dibay.app.nativevideo.NativeVideoCallLane;
import com.dibay.app.nativevideo.NativeVideoCallNotification;
import com.dibay.app.nativevoice.NativeVoiceCallNotification;

/** Best-effort server ack for native FCM receive diagnostics. Never blocks incoming UI. */
public final class IncomingCallPushAckHelper {
  private IncomingCallPushAckHelper() {}

  /**
   * R4 (2026-11-09): 수신 확인(received) 전송 완료 신호 — 표시 결과(presented/suppressed)는 이 전송이 끝난 뒤 보낸다.
   * 서버가 같은 발송 행을 읽고-고쳐-쓰므로 동시에 가면 한쪽 기록이 사라진다.
   */
  private static final ConcurrentHashMap<String, CountDownLatch> RECEIVE_ACK_DONE = new ConcurrentHashMap<>();
  /**
   * F4 (2026-11-09 감사): 수신 확인 전송 최대 소요(연결 4초 + 응답 4초 + 본문·DNS)보다 길게 —
   * 9초 상한이면 지연 시 두 보고가 동시에 서버 행을 고쳐 한쪽이 사라질 수 있었다.
   */
  private static final long PRESENTATION_WAIT_MS = 15_000L;
  private static final int MAX_PENDING_LATCHES = 64;

  /**
   * F4: 이 기기에서 이미 「띄움」으로 보고한 통화 — 같은 통화의 중복 푸시가 런타임에서 거절(runtime_declined)돼도
   * 「안 띄움」을 다시 보내 실제로 울린 기록을 덮어쓰지 않는다. 최근 통화만 보관(크기 제한).
   */
  private static final java.util.Set<String> PRESENTED_CALL_IDS =
      java.util.Collections.newSetFromMap(new ConcurrentHashMap<>());
  private static final int MAX_PRESENTED_CALL_IDS = 64;

  public static void sendAsync(
      Context context,
      IncomingCallPayload payload,
      DibayCallPushLog.ExpiryDecision expiry,
      long receivedAtMs) {
    if (context == null || payload == null || !payload.isValid()) return;
    Context app = context.getApplicationContext();
    if (RECEIVE_ACK_DONE.size() > MAX_PENDING_LATCHES) RECEIVE_ACK_DONE.clear();
    CountDownLatch done = new CountDownLatch(1);
    RECEIVE_ACK_DONE.put(payload.callId, done);
    new Thread(
            () -> {
              try {
                send(app, payload, expiry, receivedAtMs);
              } finally {
                done.countDown();
              }
            })
        .start();
  }

  /**
   * R4 — 수신 화면 표시 결과 사후 보고. 수신 동작(벨·화면·종료 처리)에 관여하지 않는다:
   * 별도 스레드, 응답 본문을 읽지 않음(종료 상태 처리 없음), 실패해도 무시.
   *
   * @param stage "presented" | "suppressed"
   */
  public static void sendPresentationAsync(
      Context context,
      String callId,
      String callType,
      String stage,
      String reason,
      String surface) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    if ("presented".equals(stage)) {
      if (PRESENTED_CALL_IDS.size() > MAX_PRESENTED_CALL_IDS) PRESENTED_CALL_IDS.clear();
      PRESENTED_CALL_IDS.add(sid);
    } else if ("suppressed".equals(stage) && PRESENTED_CALL_IDS.contains(sid)) {
      DibayCallPushLog.info(
          "push_presentation_ack_skipped", sid, "reason=already_presented suppressed=" + reason);
      RECEIVE_ACK_DONE.remove(sid);
      return;
    }
    new Thread(
            () -> {
              CountDownLatch done = RECEIVE_ACK_DONE.remove(sid);
              if (done != null) {
                try {
                  done.await(PRESENTATION_WAIT_MS, TimeUnit.MILLISECONDS);
                } catch (InterruptedException ignored) {
                  Thread.currentThread().interrupt();
                }
              }
              sendPresentation(app, sid, callType, stage, reason, surface);
            })
        .start();
  }

  private static void sendPresentation(
      Context context, String callId, String callType, String stage, String reason, String surface) {
    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.isEmpty()) {
      DibayCallPushLog.warn("push_presentation_ack_failed", callId, "reason=no_server_origin");
      return;
    }
    HttpURLConnection conn = null;
    try {
      URL url =
          new URL(
              origin
                  + "/api/community-messenger/calls/"
                  + URLEncoder.encode(callId, "UTF-8")
                  + "/push-ack");
      conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("POST");
      conn.setConnectTimeout(4_000);
      conn.setReadTimeout(4_000);
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setRequestProperty("Accept", "application/json");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) {
        conn.setRequestProperty("Cookie", cookie);
      }
      String json =
          "{"
              + "\"stage\":\""
              + escape(stage)
              + "\",\"reason\":\""
              + escape(reason)
              + "\",\"surface\":\""
              + escape(surface)
              + "\",\"platform\":\"android\""
              + ",\"deviceId\":\""
              + escape(resolveDeviceId(context))
              + "\",\"screenInteractive\":"
              + DibayKeyguardHelper.isInteractive(context)
              + ",\"keyguardLocked\":"
              + DibayKeyguardHelper.isKeyguardLocked(context)
              + ",\"mediaChannelImportance\":"
              + mediaChannelImportance(context, callType)
              + "}";
      byte[] body = json.getBytes(StandardCharsets.UTF_8);
      conn.setFixedLengthStreamingMode(body.length);
      try (OutputStream os = conn.getOutputStream()) {
        os.write(body);
      }
      int status = conn.getResponseCode();
      DibayCallPushLog.info(
          "push_presentation_ack_sent", callId, "status=" + status + " stage=" + stage + " reason=" + reason);
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "push_presentation_ack_failed", callId, "err=" + error.getClass().getSimpleName());
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  /** 통화 종류별 실제 수신 채널 중요도. 채널이 아직 없으면 -1000(IMPORTANCE_UNSPECIFIED). */
  static int mediaChannelImportance(Context context, String callType) {
    if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return -1;
    String channelId =
        NativeVideoCallLane.isVideoMediaType(callType)
            ? NativeVideoCallNotification.CHANNEL_ID
            : NativeVoiceCallNotification.CHANNEL_ID;
    try {
      NotificationManager nm = context.getSystemService(NotificationManager.class);
      NotificationChannel channel = nm != null ? nm.getNotificationChannel(channelId) : null;
      return channel != null ? channel.getImportance() : NotificationManager.IMPORTANCE_UNSPECIFIED;
    } catch (Exception ignored) {
      return NotificationManager.IMPORTANCE_UNSPECIFIED;
    }
  }

  private static void send(
      Context context,
      IncomingCallPayload payload,
      DibayCallPushLog.ExpiryDecision expiry,
      long receivedAtMs) {
    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.isEmpty()) {
      DibayCallPushLog.warn("push_ack_failed", payload.callId, "reason=no_server_origin");
      return;
    }
    HttpURLConnection conn = null;
    try {
      URL url =
          new URL(
              origin
                  + "/api/community-messenger/calls/"
                  + URLEncoder.encode(payload.callId, "UTF-8")
                  + "/push-ack");
      conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("POST");
      conn.setConnectTimeout(4_000);
      conn.setReadTimeout(4_000);
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setRequestProperty("Accept", "application/json");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) {
        conn.setRequestProperty("Cookie", cookie);
      }
      String json =
          "{"
              + "\"receivedAt\":"
              + receivedAtMs
              + ",\"deviceId\":\""
              + escape(resolveDeviceId(context))
              + "\",\"screenInteractive\":"
              + DibayKeyguardHelper.isInteractive(context)
              + ",\"keyguardLocked\":"
              + DibayKeyguardHelper.isKeyguardLocked(context)
              + ",\"deviceIdleMode\":"
              + DibayCallPushLog.isDeviceIdleMode(context)
              + ",\"notificationPermission\":"
              + IncomingCallNotificationBuilder.canPostNotifications(context)
              + ",\"channelImportance\":"
              + IncomingCallNotificationBuilder.incomingChannelImportance(context)
              + ",\"fsiAllowed\":"
              + IncomingCallNotificationBuilder.canPostFullScreenIntent(context)
              + ",\"dozeDelayMs\":"
              + (expiry != null ? expiry.deliveryDelayMs : -1L)
              + ",\"mediaChannelImportance\":"
              + mediaChannelImportance(context, payload.callType)
              + "}";
      byte[] body = json.getBytes(StandardCharsets.UTF_8);
      conn.setFixedLengthStreamingMode(body.length);
      try (OutputStream os = conn.getOutputStream()) {
        os.write(body);
      }
      int status = conn.getResponseCode();
      if (status >= 200 && status < 300) {
        DibayCallPushLog.info("push_ack_sent", payload.callId, "status=" + status);
        String responseBody = readBody(conn.getInputStream());
        String sessionStatus = parseSessionStatus(responseBody);
        if (IncomingCallSessionStatusProbe.isTerminalStatus(sessionStatus)) {
          DibayCallPushLog.info("push_ack_terminal_status", payload.callId, "status=" + sessionStatus);
          String kind =
              "active".equalsIgnoreCase(sessionStatus)
                  ? "call_answered_elsewhere"
                  : sessionStatus;
          IncomingCallTerminalHandler.handle(context, payload.callId, kind, "push_ack_status");
        }
      } else {
        DibayCallPushLog.warn("push_ack_failed", payload.callId, "status=" + status);
      }
    } catch (Exception error) {
      DibayCallPushLog.warn("push_ack_failed", payload.callId, "err=" + error.getClass().getSimpleName());
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static String resolveDeviceId(Context context) {
    String canonical = DibayCanonicalDeviceIdStore.resolveOrEmpty(context);
    if (!canonical.isEmpty()) return canonical;
    try {
      String androidId =
          Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
      if (androidId != null && !androidId.trim().isEmpty()) return androidId.trim();
    } catch (Exception ignored) {
    }
    return Build.MANUFACTURER + ":" + Build.MODEL;
  }

  private static String escape(String raw) {
    if (raw == null) return "";
    return raw.replace("\\", "\\\\").replace("\"", "\\\"");
  }

  private static String parseSessionStatus(String body) {
    try {
      if (body == null || body.trim().isEmpty()) return null;
      JSONObject json = new JSONObject(body);
      String status = json.optString("sessionStatus", "");
      return status != null && !status.trim().isEmpty() ? status.trim() : null;
    } catch (Exception ignored) {
      return null;
    }
  }

  private static String readBody(InputStream input) throws Exception {
    StringBuilder sb = new StringBuilder();
    try (BufferedReader br =
        new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
      String line;
      while ((line = br.readLine()) != null) {
        sb.append(line);
      }
    }
    return sb.toString();
  }
}
