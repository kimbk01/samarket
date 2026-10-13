package com.dibay.app.nativecall;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Durable outbound native {@code action=end} PATCH (Bug A — process death after Agora leave).
 *
 * <p>CONTRACT: the native runtime records the end intent here with a synchronous {@code commit()}
 * BEFORE it releases Agora, then sends the PATCH. A definitive server answer acks the entry. If the
 * process dies first (swipe-kill, OEM kill), the entry survives and is re-sent on the next process
 * start ({@link #drainOnProcessStart}). Server {@code end} is idempotent (ended → {@code
 * idempotent:true}), so a duplicate send is harmless.
 *
 * <p>Deliberately separate from {@code DibayCallTerminalPendingQueue}: that queue carries INBOUND
 * terminal events for WebView/JS injection (drained by MainActivity / NativeIncomingCall plugin);
 * putting outbound PATCH intents there would make JS treat them as received terminal events and
 * still never send the PATCH.
 */
public final class NativeCallTerminalEndOutbox {
  private static final String TAG = "DIBAY_CALL";
  private static final String PREFS = "dibay_native_call_end_outbox";
  private static final String KEY_QUEUE = "queue_json";
  /** Replay window for a lost end intent. Older entries are already handled by the server sweep. */
  static final long TTL_MS = 30L * 60L * 1000L;
  private static final int MAX_ITEMS = 16;

  /**
   * Bug A2 — survivor-side end after remote Agora QUIT waits this long before sending, so the
   * leaving peer's own end PATCH normally lands first (ended_by_* attribution stays with the peer
   * that hung up; the survivor's PATCH is then an idempotent no-op). Durable record is immediate.
   */
  public static final long REMOTE_QUIT_END_GRACE_MS = 5_000L;

  public static final String LANE_VOICE = "voice";
  public static final String LANE_VIDEO = "video";

  /** Sends one end PATCH; must call back exactly once. */
  public interface Sender {
    void send(Context app, Entry entry, SendCallback callback);
  }

  public interface SendCallback {
    void onDone(boolean ok, int status);
  }

  public static final class Entry {
    public final String callId;
    public final String lane;
    public final String reason;
    public final long at;

    Entry(String callId, String lane, String reason, long at) {
      this.callId = callId;
      this.lane = lane;
      this.reason = reason;
      this.at = at;
    }
  }

  /** Test hook — replaces the network sender for drain. */
  static volatile Sender senderForTests;

  private NativeCallTerminalEndOutbox() {}

  /** Synchronously persist an end intent (replaces any older entry for the same call). */
  public static void record(Context context, String callId, String lane, String reason) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String ln = LANE_VOICE.equals(lane) ? LANE_VOICE : LANE_VIDEO;
    String rs = reason != null ? reason.trim() : "";
    long now = System.currentTimeMillis();
    synchronized (NativeCallTerminalEndOutbox.class) {
      JSONArray arr = readPruned(context, now);
      JSONArray next = new JSONArray();
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null || sid.equals(o.optString("callId", "").trim())) continue;
        next.put(o);
      }
      JSONObject item = new JSONObject();
      try {
        item.put("callId", sid);
        item.put("lane", ln);
        item.put("reason", rs);
        item.put("at", now);
      } catch (JSONException ignored) {
        return;
      }
      next.put(item);
      while (next.length() > MAX_ITEMS) next.remove(0);
      write(context, next);
    }
    Log.i(TAG, "[DIBAY_CALL] native_end_outbox_recorded callId=" + sid + " lane=" + ln + " reason=" + rs);
  }

  /**
   * Settle after a send attempt. Definitive answers (2xx, or a 4xx that a retry cannot change)
   * remove the entry; transport failures / 401 / 408 / 429 / 5xx keep it for the next process start.
   */
  public static void settle(Context context, String callId, boolean ok, int status) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    if (!isDefinitive(ok, status)) {
      Log.i(
          TAG,
          "[DIBAY_CALL] native_end_outbox_kept callId=" + callId.trim() + " status=" + status);
      return;
    }
    remove(context, callId.trim());
  }

  static boolean isDefinitive(boolean ok, int status) {
    if (ok) return true;
    if (status < 400 || status >= 500) return false;
    return status != 401 && status != 408 && status != 429;
  }

  public static List<Entry> snapshot(Context context) {
    long now = System.currentTimeMillis();
    synchronized (NativeCallTerminalEndOutbox.class) {
      JSONArray arr = readPruned(context, now);
      List<Entry> out = new ArrayList<>(arr.length());
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        String sid = o.optString("callId", "").trim();
        if (sid.isEmpty()) continue;
        out.add(
            new Entry(
                sid,
                o.optString("lane", LANE_VIDEO),
                o.optString("reason", ""),
                o.optLong("at", 0L)));
      }
      return out;
    }
  }

  /** Process-start replay over the lane's own native end PATCH (same body as the live path). */
  public static void drainOnProcessStart(Context context) {
    drainOnProcessStart(
        context,
        (app, entry, cb) -> {
          if (LANE_VOICE.equals(entry.lane)) {
            com.dibay.app.nativevoice.NativeVoiceCallApi.endAsync(
                app, entry.callId, entry.reason, (ok, status, error) -> cb.onDone(ok, status));
          } else {
            com.dibay.app.nativevideo.NativeVideoCallApi.endAsync(
                app, entry.callId, entry.reason, (ok, status, error) -> cb.onDone(ok, status));
          }
        });
  }

  /**
   * Re-send end intents left by a previous process. Entries whose call is live in this process are
   * skipped (they belong to the in-flight terminal path, which settles them itself).
   */
  public static void drainOnProcessStart(Context context, Sender sender) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    Sender s = senderForTests != null ? senderForTests : sender;
    if (s == null) return;
    for (Entry entry : snapshot(app)) {
      if (isLiveInProcess(entry.callId)) continue;
      Log.i(
          TAG,
          "[DIBAY_CALL] native_end_outbox_replay callId="
              + entry.callId
              + " lane="
              + entry.lane
              + " reason="
              + entry.reason);
      s.send(app, entry, (ok, status) -> settle(app, entry.callId, ok, status));
    }
  }

  private static boolean isLiveInProcess(String callId) {
    return com.dibay.app.nativevideo.NativeVideoCallRuntime.getSession(callId) != null
        || com.dibay.app.nativevoice.NativeVoiceCallRuntime.getSession(callId) != null;
  }

  private static void remove(Context context, String sid) {
    long now = System.currentTimeMillis();
    synchronized (NativeCallTerminalEndOutbox.class) {
      JSONArray arr = readPruned(context, now);
      JSONArray next = new JSONArray();
      boolean removed = false;
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        if (sid.equals(o.optString("callId", "").trim())) {
          removed = true;
          continue;
        }
        next.put(o);
      }
      if (removed) write(context, next);
    }
  }

  public static void clearForTests(Context context) {
    synchronized (NativeCallTerminalEndOutbox.class) {
      write(context, new JSONArray());
    }
    senderForTests = null;
  }

  private static JSONArray readPruned(Context context, long now) {
    String raw = prefs(context).getString(KEY_QUEUE, "[]");
    JSONArray arr;
    try {
      arr = new JSONArray(raw != null ? raw : "[]");
    } catch (JSONException e) {
      arr = new JSONArray();
    }
    JSONArray pruned = new JSONArray();
    for (int i = 0; i < arr.length(); i++) {
      JSONObject o = arr.optJSONObject(i);
      if (o == null) continue;
      long at = o.optLong("at", 0L);
      if (at <= 0L || now - at > TTL_MS) continue;
      pruned.put(o);
    }
    if (pruned.length() != arr.length()) write(context, pruned);
    return pruned;
  }

  /** commit(), not apply(): the write must hit disk before Agora leave / process death. */
  private static void write(Context context, JSONArray arr) {
    prefs(context).edit().putString(KEY_QUEUE, arr.toString()).commit();
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }
}
