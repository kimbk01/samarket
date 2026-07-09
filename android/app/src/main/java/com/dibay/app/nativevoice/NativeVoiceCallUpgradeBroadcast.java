package com.dibay.app.nativevoice;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

/**
 * Phase V V2 — Native Supabase Realtime broadcast for voice→video upgrade signaling.
 *
 * <p>Dead code until V4 Runtime wiring. Uses V1 {@link NativeVoiceCallApi#fetchRealtimeCredentialsAsync}.
 */
public final class NativeVoiceCallUpgradeBroadcast {
  public interface PublishCallback {
    void onDone(boolean ok, String error);
  }

  public interface UpgradeBroadcastListener {
    void onUpgradeEvent(String event, String sessionId, String fromUserId, Boolean accepted);

    void onError(String error);
  }

  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final Object LISTEN_LOCK = new Object();
  private static volatile RealtimeCredentialCache credentialCache;
  private static volatile NativeVoiceCallUpgradeRealtimeClient listenClient;
  private static volatile UpgradeBroadcastListener listenListener;

  private NativeVoiceCallUpgradeBroadcast() {}

  /** Ephemeral publish — requester → peer channel (Web {@code publishVideoUpgradeRequest}). */
  public static void publishUpgradeRequestAsync(
      Context context,
      String peerUserId,
      String sessionId,
      String fromUserId,
      PublishCallback callback) {
    publishAsync(
        context,
        peerUserId,
        NativeVoiceCallUpgradeRealtimeClient.CM_VIDEO_UPGRADE_REQUEST,
        sessionId,
        fromUserId,
        null,
        callback);
  }

  /** Ephemeral publish — callee → requester channel (Web {@code publishVideoUpgradeResponse}). */
  public static void publishUpgradeResponseAsync(
      Context context,
      String peerUserId,
      String sessionId,
      String fromUserId,
      boolean accepted,
      PublishCallback callback) {
    publishAsync(
        context,
        peerUserId,
        NativeVoiceCallUpgradeRealtimeClient.CM_VIDEO_UPGRADE_RESPONSE,
        sessionId,
        fromUserId,
        accepted,
        callback);
  }

  /** Subscribe own user channel for upgrade events (Web {@code subscribeVideoUpgradeBroadcast}). */
  public static void subscribeAsync(
      Context context, String selfUserId, UpgradeBroadcastListener listener) {
    if (context == null || selfUserId == null || selfUserId.trim().isEmpty() || listener == null) {
      return;
    }
    Context app = context.getApplicationContext();
    String uid = selfUserId.trim();
    NativeVoiceCallLog.info("upgrade_rt_subscribe_start", "upgrade_rt", "userLen=" + uid.length());
    new Thread(
            () -> {
              unsubscribeInternal("resubscribe");
              withCredential(
                  app,
                  accessToken -> {
                    try {
                      NativeVoiceCallUpgradeRealtimeClient client =
                          new NativeVoiceCallUpgradeRealtimeClient();
                      client.connect(app);
                      client.joinChannel(
                          NativeVoiceCallUpgradeRealtimeClient.inviteChannelName(uid),
                          accessToken,
                          false,
                          false);
                      client.setBroadcastHandler(
                          (event, payload) -> dispatchListenEvent(event, payload, listener));
                      synchronized (LISTEN_LOCK) {
                        listenClient = client;
                        listenListener = listener;
                      }
                      NativeVoiceCallLog.info("upgrade_rt_subscribed", "upgrade_rt", "status=ok");
                    } catch (Exception error) {
                      NativeVoiceCallLog.warn(
                          "upgrade_rt_subscribe_failed",
                          "upgrade_rt",
                          "err=" + error.getClass().getSimpleName());
                      MAIN.post(() -> listener.onError(error.getClass().getSimpleName()));
                    }
                  },
                  error -> {
                    NativeVoiceCallLog.warn("upgrade_rt_subscribe_failed", "upgrade_rt", "err=" + error);
                    MAIN.post(() -> listener.onError(error));
                  });
            },
            "dibay-upgrade-rt-subscribe")
        .start();
  }

  public static void unsubscribe() {
    unsubscribeInternal("manual");
  }

  static void clearCredentialCacheForTests() {
    credentialCache = null;
  }

  private static void publishAsync(
      Context context,
      String peerUserId,
      String event,
      String sessionId,
      String fromUserId,
      Boolean accepted,
      PublishCallback callback) {
    if (context == null || peerUserId == null || peerUserId.trim().isEmpty()) return;
    if (sessionId == null || sessionId.trim().isEmpty()) return;
    if (fromUserId == null || fromUserId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = sessionId.trim();
    NativeVoiceCallLog.info("upgrade_rt_publish_start", sid, "event=" + event);
    new Thread(
            () ->
                withCredential(
                    app,
                    accessToken -> {
                      NativeVoiceCallUpgradeRealtimeClient client =
                          new NativeVoiceCallUpgradeRealtimeClient();
                      try {
                        client.connect(app);
                        client.joinChannel(
                            NativeVoiceCallUpgradeRealtimeClient.inviteChannelName(
                                peerUserId.trim()),
                            accessToken,
                            false,
                            false);
                        JSONObject payload = new JSONObject();
                        payload.put("sessionId", sid);
                        payload.put("fromUserId", fromUserId.trim());
                        if (accepted != null) {
                          payload.put("accepted", accepted.booleanValue());
                        }
                        client.publishBroadcast(event, payload);
                        NativeVoiceCallLog.info("upgrade_rt_publish_done", sid, "event=" + event);
                        finishPublish(callback, true, null);
                      } catch (Exception error) {
                        NativeVoiceCallLog.warn(
                            "upgrade_rt_publish_failed",
                            sid,
                            "event=" + event + " err=" + error.getClass().getSimpleName());
                        finishPublish(callback, false, error.getClass().getSimpleName());
                      } finally {
                        client.leaveAndClose();
                      }
                    },
                    error -> {
                      NativeVoiceCallLog.warn(
                          "upgrade_rt_publish_failed", sid, "event=" + event + " err=" + error);
                      finishPublish(callback, false, error);
                    }),
            "dibay-upgrade-rt-publish")
        .start();
  }

  private static void withCredential(
      Context app, CredentialSuccess success, CredentialFailure failure) {
    RealtimeCredentialCache cache = credentialCache;
    if (cache != null && cache.isValid()) {
      success.onCredential(cache.accessToken);
      return;
    }
    NativeVoiceCallApi.fetchRealtimeCredentialsAsync(
        app,
        (credentials, error) -> {
          if (credentials == null || error != null) {
            failure.onFailure(error != null ? error : "realtime_cred_failed");
            return;
          }
          credentialCache = RealtimeCredentialCache.from(credentials);
          success.onCredential(credentialCache.accessToken);
        });
  }

  private static void finishPublish(PublishCallback callback, boolean ok, String error) {
    if (callback == null) return;
    MAIN.post(() -> callback.onDone(ok, error));
  }

  private static void dispatchListenEvent(
      String event, JSONObject payload, UpgradeBroadcastListener listener) {
    if (payload == null) return;
    String sessionId = payload.optString("sessionId", "");
    String fromUserId = payload.optString("fromUserId", "");
    if (sessionId.isEmpty()) return;
    Boolean accepted = payload.has("accepted") ? payload.optBoolean("accepted") : null;
    NativeVoiceCallLog.info(
        "upgrade_rt_receive", sessionId, "event=" + event + " fromLen=" + fromUserId.length());
    MAIN.post(() -> listener.onUpgradeEvent(event, sessionId, fromUserId, accepted));
  }

  private static void unsubscribeInternal(String reason) {
    NativeVoiceCallUpgradeRealtimeClient client;
    synchronized (LISTEN_LOCK) {
      client = listenClient;
      listenClient = null;
      listenListener = null;
    }
    if (client != null) {
      NativeVoiceCallLog.info("upgrade_rt_unsubscribe", "upgrade_rt", "reason=" + reason);
      client.leaveAndClose();
    }
  }

  private interface CredentialSuccess {
    void onCredential(String accessToken);
  }

  private interface CredentialFailure {
    void onFailure(String error);
  }

  static final class RealtimeCredentialCache {
    final String accessToken;
    final long expiresAtMs;

    private RealtimeCredentialCache(String accessToken, long expiresAtMs) {
      this.accessToken = accessToken;
      this.expiresAtMs = expiresAtMs;
    }

    static RealtimeCredentialCache from(NativeVoiceCallApi.RealtimeCredentials credentials) {
      long expiresAtMs = parseExpiresAtMs(credentials.expiresAt);
      return new RealtimeCredentialCache(credentials.accessToken, expiresAtMs);
    }

    boolean isValid() {
      if (accessToken == null || accessToken.isEmpty()) return false;
      return expiresAtMs - System.currentTimeMillis() > 120_000L;
    }

    private static long parseExpiresAtMs(String expiresAt) {
      if (expiresAt == null || expiresAt.isEmpty()) return 0L;
      try {
        SimpleDateFormat sdf =
            new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf.parse(expiresAt).getTime();
      } catch (Exception error) {
        return 0L;
      }
    }
  }
}
