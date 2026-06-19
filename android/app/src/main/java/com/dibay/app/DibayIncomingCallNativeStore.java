package com.dibay.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Persistent native incoming-call state shared by FCM, notification actions, and WebView resume. */
public final class DibayIncomingCallNativeStore {
  public static final String STATE_RINGING = "ringing";
  public static final String STATE_CONNECTING = "connecting";
  public static final String STATE_ACTIVE = "active";
  public static final String STATE_ENDING = "ending";
  public static final String STATE_TERMINAL = "terminal";

  private static final String PREFS = "dibay_incoming_call_native_store";
  private static final String KEY_CALL_ID = "call_id";
  private static final String KEY_ROOM_ID = "room_id";
  private static final String KEY_CALLER_ID = "caller_id";
  private static final String KEY_CALLER_NAME = "caller_name";
  private static final String KEY_CALLER_AVATAR_URL = "caller_avatar_url";
  private static final String KEY_MEDIA_TYPE = "media_type";
  private static final String KEY_STATE = "state";
  private static final String KEY_ROUTE = "route";
  private static final String KEY_CREATED_AT = "created_at";
  private static final String KEY_EXPIRES_AT = "expires_at";

  private DibayIncomingCallNativeStore() {}

  public static boolean setRinging(Context context, IncomingCallPayload payload, String route, long effectiveExpiresAtMs) {
    if (context == null || payload == null || !payload.isValid()) return false;
    Context app = context.getApplicationContext();
    SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String existingCallId = prefs.getString(KEY_CALL_ID, "");
    String existingState = prefs.getString(KEY_STATE, "");
    String sid = payload.callId.trim();
    if (sid.equals(existingCallId) && STATE_RINGING.equals(existingState)) {
      DibayCallPushLog.info(
          "active_incoming_store_reused", sid, "state=" + existingState + " route=" + prefs.getString(KEY_ROUTE, ""));
      return false;
    }

    prefs
        .edit()
        .putString(KEY_CALL_ID, sid)
        .putString(KEY_ROOM_ID, payload.roomId)
        .putString(KEY_CALLER_ID, payload.callerId)
        .putString(KEY_CALLER_NAME, payload.callerName)
        .putString(KEY_CALLER_AVATAR_URL, payload.callerAvatarUrl != null ? payload.callerAvatarUrl : "")
        .putString(KEY_MEDIA_TYPE, payload.callType)
        .putString(KEY_STATE, STATE_RINGING)
        .putString(KEY_ROUTE, route != null ? route : "")
        .putLong(KEY_CREATED_AT, System.currentTimeMillis())
        .putLong(KEY_EXPIRES_AT, effectiveExpiresAtMs)
        .apply();
    DibayCallPushLog.info("active_incoming_store_set", sid, "state=ringing route=" + route);
    return true;
  }

  public static void markState(Context context, String callId, String state) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String existingCallId = prefs.getString(KEY_CALL_ID, "");
    if (!sid.equals(existingCallId)) return;
    prefs.edit().putString(KEY_STATE, state != null ? state : STATE_TERMINAL).apply();
    DibayCallPushLog.info("active_incoming_store_set", sid, "state=" + (state != null ? state : STATE_TERMINAL));
  }

  public static void clear(Context context, String callId, String reason) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String existingCallId = prefs.getString(KEY_CALL_ID, "");
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : existingCallId;
    if (sid == null || sid.isEmpty()) return;
    if (!existingCallId.isEmpty() && !sid.equals(existingCallId)) return;
    prefs.edit().clear().apply();
    DibayCallPushLog.info("active_incoming_store_clear", sid, "reason=" + (reason != null ? reason : "unknown"));
  }

  public static String getActiveCallId(Context context) {
    if (context == null) return "";
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CALL_ID, "");
  }

  /** Web accept bootstrap — hydrate peer + navigation seed + native pending (loadUrl callback 직전) */
  public static String buildAcceptRouteBootstrapJs(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return "(function(){})();";
    Context app = context.getApplicationContext();
    SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String sid = callId.trim();
    if (!sid.equals(prefs.getString(KEY_CALL_ID, ""))) return "(function(){})();";
    try {
      long at = System.currentTimeMillis();
      String callerName = prefs.getString(KEY_CALLER_NAME, "");
      String avatarUrl = prefs.getString(KEY_CALLER_AVATAR_URL, "");
      String roomId = prefs.getString(KEY_ROOM_ID, "");
      String callerId = prefs.getString(KEY_CALLER_ID, "");
      String mediaType = prefs.getString(KEY_MEDIA_TYPE, "");
      String callKind = "video".equalsIgnoreCase(mediaType) ? "video" : "voice";
      String peerLabel = callerName != null ? callerName.trim() : "";

      JSONObject hydratePeer = new JSONObject();
      hydratePeer.put("sessionId", sid);
      hydratePeer.put("peerLabel", peerLabel);
      hydratePeer.put("peerAvatarUrl", avatarUrl != null ? avatarUrl.trim() : "");
      hydratePeer.put("callKind", callKind);
      hydratePeer.put("roomId", roomId != null ? roomId.trim() : "");
      hydratePeer.put("peerUserId", callerId != null ? callerId.trim() : "");
      hydratePeer.put("at", at);
      hydratePeer.put("source", "native_store");

      String nowIso = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
          .format(new java.util.Date(at));

      JSONObject session = new JSONObject();
      session.put("id", sid);
      session.put("roomId", roomId != null ? roomId.trim() : "");
      session.put("sessionMode", "direct");
      session.put("initiatorUserId", callerId != null ? callerId.trim() : "");
      session.put("recipientUserId", JSONObject.NULL);
      session.put("peerUserId", callerId != null ? callerId.trim() : "");
      session.put("peerLabel", peerLabel);
      if (avatarUrl != null && !avatarUrl.trim().isEmpty()) {
        session.put("peerAvatarUrl", avatarUrl.trim());
      } else {
        session.put("peerAvatarUrl", JSONObject.NULL);
      }
      session.put("callKind", callKind);
      session.put("status", "active");
      session.put("startedAt", nowIso);
      session.put("answeredAt", nowIso);
      session.put("endedAt", JSONObject.NULL);
      session.put("isMineInitiator", false);
      session.put("participants", new JSONArray());
      session.put("source", "native_accept_bootstrap");

      JSONObject navSeed = new JSONObject();
      navSeed.put("sessionId", sid);
      navSeed.put("session", session);
      navSeed.put("at", at);

      JSONObject pending = new JSONObject();
      pending.put("sessionId", sid);
      pending.put("at", at);

      return "(function(){try{"
          + "sessionStorage.setItem('samarket.cm.call_accept_hydrate_peer.v1',"
          + JSONObject.quote(hydratePeer.toString())
          + ");"
          + "sessionStorage.setItem('samarket.cm.call_session_seed.v1',"
          + JSONObject.quote(navSeed.toString())
          + ");"
          + "sessionStorage.setItem('cm_native_callee_accept_pending',"
          + JSONObject.quote(pending.toString())
          + ");"
          + "}catch(e){}})();";
    } catch (Exception error) {
      return "(function(){})();";
    }
  }
}
