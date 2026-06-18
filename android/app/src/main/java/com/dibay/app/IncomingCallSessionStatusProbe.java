package com.dibay.app;

import android.content.Context;
import android.os.Looper;
import android.util.Log;
import android.webkit.CookieManager;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

/**
 * Server truth probe for incoming-call terminal decisions.
 *
 * <p>Probe failure must <b>not</b> fail-open into ringing cleanup — callers defer and keep active
 * session until status is confirmed or user action completes.
 */
public final class IncomingCallSessionStatusProbe {
  private static final String TAG = "DIBAY_CALL";

  private IncomingCallSessionStatusProbe() {}

  public static final class ProbeResult {
    public final boolean ok;
    public final String status;
    public final String failureDetail;

    private ProbeResult(boolean ok, String status, String failureDetail) {
      this.ok = ok;
      this.status = status;
      this.failureDetail = failureDetail;
    }

    public static ProbeResult success(String status) {
      return new ProbeResult(true, status != null ? status.trim() : "", null);
    }

    public static ProbeResult deferred(String failureDetail) {
      return new ProbeResult(false, null, failureDetail != null ? failureDetail : "unknown");
    }
  }

  public static boolean shouldProbe(DibayCallPushLog.ExpiryDecision expiry) {
    return expiry != null && expiry.deliveryDelayMs >= 10_000L;
  }

  /** @deprecated prefer {@link #probe(Context, String)} — null means deferred, not confirmed. */
  public static String fetchStatus(Context context, String callId) {
    ProbeResult result = probe(context, callId);
    return result.ok ? result.status : null;
  }

  public static ProbeResult probe(Context context, String callId) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      return probeOffMainThread(context, callId);
    }
    return probeOnCurrentThread(context, callId);
  }

  private static ProbeResult probeOffMainThread(Context context, String callId) {
    AtomicReference<ProbeResult> result = new AtomicReference<>(ProbeResult.deferred("probe_timeout"));
    CountDownLatch latch = new CountDownLatch(1);
    new Thread(
            () -> {
              try {
                result.set(probeOnCurrentThread(context, callId));
              } finally {
                latch.countDown();
              }
            },
            "incoming-call-status-probe")
        .start();
    try {
      latch.await(1_500L, TimeUnit.MILLISECONDS);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      return logAndDefer(callId, "probe", "interrupted");
    }
    ProbeResult resolved = result.get();
    return resolved != null ? resolved : ProbeResult.deferred("probe_timeout");
  }

  private static ProbeResult probeOnCurrentThread(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) {
      return ProbeResult.deferred("invalid_args");
    }
    String sid = callId.trim();
    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.isEmpty()) {
      return logAndDefer(sid, "probe", "origin_unresolved");
    }
    HttpURLConnection conn = null;
    try {
      URL url =
          new URL(
              origin
                  + "/api/community-messenger/calls/sessions/"
                  + URLEncoder.encode(sid, "UTF-8"));
      conn = (HttpURLConnection) url.openConnection();
      conn.setRequestMethod("GET");
      conn.setConnectTimeout(1_200);
      conn.setReadTimeout(1_200);
      conn.setRequestProperty("Accept", "application/json");
      String cookie = CookieManager.getInstance().getCookie(origin);
      if (cookie != null && !cookie.isEmpty()) {
        conn.setRequestProperty("Cookie", cookie);
      } else {
        DibayCallPushLog.warn("incoming_status_probe_no_cookie", sid, "origin=" + origin);
      }
      int httpStatus = conn.getResponseCode();
      if (httpStatus < 200 || httpStatus >= 300) {
        return logAndDefer(sid, "probe", "http_status=" + httpStatus);
      }
      String body = readBody(conn.getInputStream());
      JSONObject json = new JSONObject(body);
      JSONObject session = json.optJSONObject("session");
      String sessionStatus = session != null ? session.optString("status", "") : "";
      if (sessionStatus == null || sessionStatus.trim().isEmpty()) {
        return logAndDefer(sid, "probe", "empty_session_status");
      }
      return ProbeResult.success(sessionStatus);
    } catch (Exception error) {
      return logAndDefer(sid, "probe", "err=" + error.getClass().getSimpleName());
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  public static void logProbeDeferred(String callId, String source, String detail) {
    Log.w(
        TAG,
        "[DIBAY_CALL] server_probe_failed_deferred"
            + " callId="
            + callId
            + " source="
            + source
            + " detail="
            + (detail != null ? detail : ""));
    DibayCallPushLog.warn(
        "server_probe_failed_deferred",
        callId,
        "source=" + source + " detail=" + (detail != null ? detail : ""));
  }

  public static boolean requiresConfirmationBeforeCleanup(IncomingCallCleanupReason reason) {
    if (reason == null) return false;
    return reason == IncomingCallCleanupReason.CALLER_CANCELLED
        || reason == IncomingCallCleanupReason.MISSED_TIMEOUT
        || reason == IncomingCallCleanupReason.REMOTE_ENDED;
  }

  public static boolean statusAllowsCleanup(IncomingCallCleanupReason reason, String status) {
    if (reason == null || status == null) return false;
    String s = status.trim().toLowerCase();
    switch (reason) {
      case CALLER_CANCELLED:
        return "cancelled".equals(s) || "canceled".equals(s);
      case MISSED_TIMEOUT:
        return "missed".equals(s) || "ringing".equals(s);
      case REMOTE_ENDED:
        return "ended".equals(s)
            || "cancelled".equals(s)
            || "canceled".equals(s)
            || "rejected".equals(s)
            || "missed".equals(s);
      default:
        return true;
    }
  }

  public static boolean isTerminalStatus(String status) {
    if (status == null) return false;
    switch (status.trim().toLowerCase()) {
      case "cancelled":
      case "canceled":
      case "rejected":
      case "missed":
      case "ended":
        return true;
      default:
        return false;
    }
  }

  public static boolean isActiveStatus(String status) {
    return status != null && "active".equalsIgnoreCase(status.trim());
  }

  private static ProbeResult logAndDefer(String callId, String source, String detail) {
    logProbeDeferred(callId, source, detail);
    DibayCallPushLog.warn("incoming_status_probe_failed", callId, detail);
    return ProbeResult.deferred(detail);
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
