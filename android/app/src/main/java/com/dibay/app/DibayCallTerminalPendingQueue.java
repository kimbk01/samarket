package com.dibay.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Terminal events received while WebView is unavailable — drained on resume or via NativeIncomingCall plugin. */
public final class DibayCallTerminalPendingQueue {
  private static final String TAG = "DIBAY_CALL";
  private static final String PREFS = "dibay_call_terminal_pending";
  private static final String KEY_QUEUE = "queue_json";
  private static final long TTL_MS = 120_000L;
  private static final int MAX_ITEMS = 32;

  public static final class Entry {
    public final String callId;
    public final String status;
    public final long at;

    Entry(String callId, String status, long at) {
      this.callId = callId;
      this.status = status;
      this.at = at;
    }
  }

  private DibayCallTerminalPendingQueue() {}

  public static void enqueue(Context context, String callId, String status) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String st = status != null && !status.trim().isEmpty() ? status.trim().toLowerCase() : "cancelled";
    long now = System.currentTimeMillis();
    synchronized (DibayCallTerminalPendingQueue.class) {
      JSONArray arr = readArray(context, now);
      JSONArray next = new JSONArray();
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        String existingId = o.optString("callId", "").trim();
        if (existingId.equals(sid)) continue;
        next.put(o);
      }
      JSONObject item = new JSONObject();
      try {
        item.put("callId", sid);
        item.put("status", st);
        item.put("at", now);
      } catch (JSONException ignored) {
        return;
      }
      next.put(item);
      while (next.length() > MAX_ITEMS) {
        next.remove(0);
      }
      writeArray(context, next);
    }
    Log.i(TAG, "[DIBAY_CALL] terminal_queued callId=" + sid + " status=" + st);
  }

  /** Snapshot non-expired items without removing (MainActivity retry inject). */
  public static List<Entry> snapshot(Context context) {
    long now = System.currentTimeMillis();
    synchronized (DibayCallTerminalPendingQueue.class) {
      JSONArray arr = readArray(context, now);
      List<Entry> out = new ArrayList<>(arr.length());
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        String callId = o.optString("callId", "").trim();
        if (callId.isEmpty()) continue;
        String status = o.optString("status", "cancelled").trim().toLowerCase();
        long at = o.optLong("at", 0L);
        if (at <= 0L || now - at > TTL_MS) continue;
        out.add(new Entry(callId, status, at));
      }
      return out;
    }
  }

  public static void ack(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    long now = System.currentTimeMillis();
    synchronized (DibayCallTerminalPendingQueue.class) {
      JSONArray arr = readArray(context, now);
      JSONArray next = new JSONArray();
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        if (sid.equals(o.optString("callId", "").trim())) continue;
        next.put(o);
      }
      writeArray(context, next);
    }
  }

  /** Remove all non-expired items and return them (JS plugin drain). */
  public static List<Entry> drain(Context context) {
    long now = System.currentTimeMillis();
    synchronized (DibayCallTerminalPendingQueue.class) {
      JSONArray arr = readArray(context, now);
      writeArray(context, new JSONArray());
      List<Entry> out = new ArrayList<>(arr.length());
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        String callId = o.optString("callId", "").trim();
        if (callId.isEmpty()) continue;
        String status = o.optString("status", "cancelled").trim().toLowerCase();
        long at = o.optLong("at", 0L);
        if (at <= 0L || now - at > TTL_MS) continue;
        out.add(new Entry(callId, status, at));
      }
      if (!out.isEmpty()) {
        Log.i(TAG, "[DIBAY_CALL] terminal_queue_drained count=" + out.size());
      }
      return out;
    }
  }

  private static JSONArray readArray(Context context, long now) {
    SharedPreferences prefs = prefs(context);
    String raw = prefs.getString(KEY_QUEUE, "[]");
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
    if (pruned.length() != arr.length()) {
      writeArray(context, pruned);
    }
    return pruned;
  }

  private static void writeArray(Context context, JSONArray arr) {
    prefs(context).edit().putString(KEY_QUEUE, arr.toString()).apply();
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }
}
