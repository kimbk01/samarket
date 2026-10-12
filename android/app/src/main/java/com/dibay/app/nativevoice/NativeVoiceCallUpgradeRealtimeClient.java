package com.dibay.app.nativevoice;

import android.content.Context;
import com.dibay.app.R;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;
import org.json.JSONObject;

/** Supabase Realtime Phoenix client — broadcast subset only (Phase V V2). */
final class NativeVoiceCallUpgradeRealtimeClient {
  static final String CM_VIDEO_UPGRADE_REQUEST = "cm_video_upgrade_request";
  static final String CM_VIDEO_UPGRADE_RESPONSE = "cm_video_upgrade_response";
  static final int SUBSCRIBE_TIMEOUT_MS = 1_800;
  private static final int HEARTBEAT_INTERVAL_MS = 25_000;
  private static final String VSN = "2.0.0";
  private static final byte KIND_USER_BROADCAST_PUSH = 3;
  private static final byte KIND_USER_BROADCAST = 4;
  private static final byte JSON_ENCODING = 1;

  interface BroadcastHandler {
    void onBroadcast(String event, JSONObject payload);
  }

  private final OkHttpClient httpClient = new OkHttpClient.Builder().build();
  private final AtomicInteger refCounter = new AtomicInteger(0);
  private final AtomicReference<String> joinRef = new AtomicReference<>("");
  private final AtomicBoolean connected = new AtomicBoolean(false);
  private final AtomicBoolean joined = new AtomicBoolean(false);

  private WebSocket webSocket;
  private String currentTopic = "";
  private BroadcastHandler broadcastHandler;
  private Thread heartbeatThread;
  private volatile boolean closed;
  private volatile CountDownLatch joinLatch;
  private volatile AtomicReference<String> joinErrorRef;

  static String inviteChannelName(String userId) {
    if (userId == null) return "cm-call-invite:";
    return "cm-call-invite:" + userId.trim().toLowerCase(Locale.US);
  }

  static String realtimeTopic(String channelName) {
    return "realtime:" + channelName;
  }

  static String buildWebSocketUrl(Context context) throws Exception {
    String base = context.getString(R.string.dibay_supabase_url).trim();
    String anon = context.getString(R.string.dibay_supabase_anon_key).trim();
    if (base.isEmpty() || anon.isEmpty()) {
      throw new IllegalStateException("supabase_config_missing");
    }
    if (base.endsWith("/")) {
      base = base.substring(0, base.length() - 1);
    }
    String wsBase =
        base.startsWith("https://")
            ? "wss://" + base.substring("https://".length())
            : base.startsWith("http://")
                ? "ws://" + base.substring("http://".length())
                : base;
    return wsBase
        + "/realtime/v1/websocket?apikey="
        + urlEncode(anon)
        + "&vsn="
        + urlEncode(VSN);
  }

  void connect(Context context) throws Exception {
    if (closed) {
      throw new IllegalStateException("client_closed");
    }
    String url = buildWebSocketUrl(context);
    Request request = new Request.Builder().url(url).build();
    CountDownLatch openLatch = new CountDownLatch(1);
    AtomicReference<String> openError = new AtomicReference<>();
    webSocket =
        httpClient.newWebSocket(
            request,
            new WebSocketListener() {
              @Override
              public void onOpen(WebSocket socket, Response response) {
                connected.set(true);
                openLatch.countDown();
              }

              @Override
              public void onMessage(WebSocket socket, String text) {
                handleIncoming(text);
              }

              @Override
              public void onMessage(WebSocket socket, ByteString bytes) {
                handleIncoming(bytes.toByteArray());
              }

              @Override
              public void onFailure(WebSocket socket, Throwable t, Response response) {
                openError.set(t != null ? t.getClass().getSimpleName() : "ws_failure");
                openLatch.countDown();
                releaseJoinWait("ws_failure");
              }

              @Override
              public void onClosed(WebSocket socket, int code, String reason) {
                connected.set(false);
                joined.set(false);
              }
            });
    if (!openLatch.await(SUBSCRIBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
      throw new IllegalStateException("ws_open_timeout");
    }
    if (openError.get() != null) {
      throw new IllegalStateException(openError.get());
    }
  }

  void joinChannel(String channelName, String accessToken, boolean ack, boolean self)
      throws Exception {
    if (!connected.get() || webSocket == null) {
      throw new IllegalStateException("ws_not_connected");
    }
    joined.set(false);
    currentTopic = realtimeTopic(channelName);
    String pendingJoinRef = nextRef();
    joinRef.set(pendingJoinRef);
    joinLatch = new CountDownLatch(1);
    joinErrorRef = new AtomicReference<>();

    JSONObject config = new JSONObject();
    config.put("broadcast", new JSONObject().put("ack", ack).put("self", self));
    config.put("presence", new JSONObject().put("key", "").put("enabled", false));
    config.put("private", false);
    JSONObject payload = new JSONObject();
    payload.put("config", config);
    payload.put("access_token", accessToken);
    sendJson(pendingJoinRef, currentTopic, "phx_join", payload, pendingJoinRef);

    if (!joinLatch.await(SUBSCRIBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
      throw new IllegalStateException("channel_join_timeout");
    }
    if (joinErrorRef.get() != null) {
      throw new IllegalStateException(joinErrorRef.get());
    }
    joined.set(true);
    startHeartbeatIfNeeded();
  }

  void publishBroadcast(String event, JSONObject userPayload) throws Exception {
    if (!joined.get() || webSocket == null) {
      throw new IllegalStateException("channel_not_joined");
    }
    byte[] frame =
        encodeBroadcastPush(joinRef.get(), nextRef(), currentTopic, event, userPayload);
    webSocket.send(ByteString.of(frame));
  }

  void setBroadcastHandler(BroadcastHandler handler) {
    broadcastHandler = handler;
  }

  void leaveAndClose() {
    closed = true;
    stopHeartbeat();
    try {
      if (webSocket != null && joined.get() && !currentTopic.isEmpty()) {
        sendJson(joinRef.get(), currentTopic, "phx_leave", new JSONObject(), nextRef());
      }
    } catch (Exception ignored) {
      /* best effort */
    }
    if (webSocket != null) {
      try {
        webSocket.close(1000, "upgrade_rt_done");
      } catch (Exception ignored) {
        /* ignore */
      }
      webSocket = null;
    }
    connected.set(false);
    joined.set(false);
    broadcastHandler = null;
    currentTopic = "";
  }

  private void releaseJoinWait(String error) {
    if (joinErrorRef != null && error != null) {
      joinErrorRef.set(error);
    }
    if (joinLatch != null) {
      joinLatch.countDown();
    }
  }

  private void handleIncoming(String text) {
    try {
      org.json.JSONArray arr = new org.json.JSONArray(text);
      if (arr.length() < 5) return;
      String ref = arr.optString(1, null);
      String event = arr.optString(3, null);
      Object payloadObj = arr.opt(4);
      dispatchMessage(ref, event, payloadObj);
    } catch (Exception ignored) {
      /* ignore malformed */
    }
  }

  private void handleIncoming(byte[] bytes) {
    try {
      DecodedBroadcast decoded = decodeBroadcast(bytes);
      if (decoded == null) return;
      JSONObject wrapper = new JSONObject();
      wrapper.put("type", "broadcast");
      wrapper.put("event", decoded.userEvent);
      wrapper.put("payload", decoded.payload);
      dispatchMessage(null, "broadcast", wrapper);
    } catch (Exception ignored) {
      /* ignore malformed */
    }
  }

  private void dispatchMessage(String ref, String event, Object payloadObj) {
    if ("phx_reply".equals(event) && joinLatch != null && joinRef.get().equals(ref)) {
      String status = "";
      if (payloadObj instanceof JSONObject) {
        status = ((JSONObject) payloadObj).optString("status", "");
      }
      if (!"ok".equals(status)) {
        joinErrorRef.set("channel_join_error");
      }
      joinLatch.countDown();
      return;
    }
    if ("broadcast".equals(event) && broadcastHandler != null && payloadObj instanceof JSONObject) {
      JSONObject wrapper = (JSONObject) payloadObj;
      String userEvent = wrapper.optString("event", "");
      JSONObject userPayload = wrapper.optJSONObject("payload");
      if (!userEvent.isEmpty() && userPayload != null) {
        broadcastHandler.onBroadcast(userEvent, userPayload);
      }
    }
  }

  private void sendJson(
      String msgJoinRef, String topic, String event, JSONObject payload, String ref)
      throws Exception {
    if (webSocket == null) throw new IllegalStateException("ws_not_connected");
    org.json.JSONArray frame = new org.json.JSONArray();
    frame.put(msgJoinRef != null ? msgJoinRef : "");
    frame.put(ref != null ? ref : "");
    frame.put(topic != null ? topic : "");
    frame.put(event);
    frame.put(payload != null ? payload : JSONObject.NULL);
    webSocket.send(frame.toString());
  }

  private String nextRef() {
    return String.valueOf(refCounter.incrementAndGet());
  }

  private void startHeartbeatIfNeeded() {
    if (heartbeatThread != null) return;
    heartbeatThread =
        new Thread(
            () -> {
              while (!closed && connected.get()) {
                try {
                  Thread.sleep(HEARTBEAT_INTERVAL_MS);
                  if (closed || !connected.get() || webSocket == null) return;
                  sendJson("", "phoenix", "heartbeat", new JSONObject(), nextRef());
                } catch (Exception ignored) {
                  return;
                }
              }
            },
            "dibay-upgrade-rt-heartbeat");
    heartbeatThread.setDaemon(true);
    heartbeatThread.start();
  }

  private void stopHeartbeat() {
    Thread t = heartbeatThread;
    heartbeatThread = null;
    if (t != null) {
      t.interrupt();
    }
  }

  static byte[] encodeBroadcastPush(
      String joinRefValue,
      String refValue,
      String topic,
      String userEvent,
      JSONObject userPayload)
      throws Exception {
    byte[] encodedPayload =
        (userPayload != null ? userPayload : new JSONObject())
            .toString()
            .getBytes(StandardCharsets.UTF_8);
    String metadata = "";
    String joinRefSafe = joinRefValue != null ? joinRefValue : "";
    String refSafe = refValue != null ? refValue : "";
    ByteArrayOutputStream header = new ByteArrayOutputStream();
    header.write(KIND_USER_BROADCAST_PUSH);
    header.write(joinRefSafe.length() & 0xff);
    header.write(refSafe.length() & 0xff);
    header.write(topic.length() & 0xff);
    header.write(userEvent.length() & 0xff);
    header.write(metadata.length() & 0xff);
    header.write(JSON_ENCODING);
    header.write(joinRefSafe.getBytes(StandardCharsets.UTF_8));
    header.write(refSafe.getBytes(StandardCharsets.UTF_8));
    header.write(topic.getBytes(StandardCharsets.UTF_8));
    header.write(userEvent.getBytes(StandardCharsets.UTF_8));
    header.write(metadata.getBytes(StandardCharsets.UTF_8));
    ByteArrayOutputStream out = new ByteArrayOutputStream(header.size() + encodedPayload.length);
    out.write(header.toByteArray());
    out.write(encodedPayload);
    return out.toByteArray();
  }

  /** Decode kind-3 push frame (client → server), matches Web {@code userBroadcastPush}. */
  static DecodedBroadcast decodeBroadcastPush(byte[] buffer) throws Exception {
    if (buffer == null || buffer.length < 7) return null;
    if (buffer[0] != KIND_USER_BROADCAST_PUSH) return null;
    int joinRefSize = buffer[1] & 0xff;
    int refSize = buffer[2] & 0xff;
    int topicSize = buffer[3] & 0xff;
    int userEventSize = buffer[4] & 0xff;
    int metadataSize = buffer[5] & 0xff;
    int payloadEncoding = buffer[6] & 0xff;
    int offset = 7;
    offset += joinRefSize;
    offset += refSize;
    String topic = readUtf8(buffer, offset, topicSize);
    offset += topicSize;
    String userEvent = readUtf8(buffer, offset, userEventSize);
    offset += userEventSize;
    offset += metadataSize;
    return decodePayloadTail(topic, userEvent, buffer, offset, payloadEncoding);
  }

  /** Encode kind-4 receive frame (server → client), for codec parity tests only. */
  static byte[] encodeBroadcastReceive(String topic, String userEvent, JSONObject userPayload)
      throws Exception {
    byte[] encodedPayload =
        (userPayload != null ? userPayload : new JSONObject())
            .toString()
            .getBytes(StandardCharsets.UTF_8);
    String metadata = "";
    ByteArrayOutputStream header = new ByteArrayOutputStream();
    header.write(KIND_USER_BROADCAST);
    header.write(topic.length() & 0xff);
    header.write(userEvent.length() & 0xff);
    header.write(metadata.length() & 0xff);
    header.write(JSON_ENCODING);
    header.write(topic.getBytes(StandardCharsets.UTF_8));
    header.write(userEvent.getBytes(StandardCharsets.UTF_8));
    header.write(metadata.getBytes(StandardCharsets.UTF_8));
    ByteArrayOutputStream out = new ByteArrayOutputStream(header.size() + encodedPayload.length);
    out.write(header.toByteArray());
    out.write(encodedPayload);
    return out.toByteArray();
  }

  /** Decode kind-4 receive frame (server → client), matches Web {@code userBroadcast}. */
  static DecodedBroadcast decodeBroadcast(byte[] buffer) throws Exception {
    if (buffer == null || buffer.length < 5) return null;
    if (buffer[0] != KIND_USER_BROADCAST) return null;
    int topicSize = buffer[1] & 0xff;
    int userEventSize = buffer[2] & 0xff;
    int metadataSize = buffer[3] & 0xff;
    int payloadEncoding = buffer[4] & 0xff;
    int offset = 5;
    String topic = readUtf8(buffer, offset, topicSize);
    offset += topicSize;
    String userEvent = readUtf8(buffer, offset, userEventSize);
    offset += userEventSize;
    offset += metadataSize;
    return decodePayloadTail(topic, userEvent, buffer, offset, payloadEncoding);
  }

  private static DecodedBroadcast decodePayloadTail(
      String topic, String userEvent, byte[] buffer, int offset, int payloadEncoding)
      throws Exception {
    byte[] payloadBytes = new byte[buffer.length - offset];
    System.arraycopy(buffer, offset, payloadBytes, 0, payloadBytes.length);
    JSONObject payload;
    if (payloadEncoding == JSON_ENCODING) {
      payload = new JSONObject(new String(payloadBytes, StandardCharsets.UTF_8));
    } else {
      payload = new JSONObject();
    }
    DecodedBroadcast decoded = new DecodedBroadcast();
    decoded.topic = topic;
    decoded.userEvent = userEvent;
    decoded.payload = payload;
    decoded.event = "broadcast";
    return decoded;
  }

  private static String readUtf8(byte[] buffer, int offset, int length) {
    if (length <= 0) return "";
    return new String(buffer, offset, length, StandardCharsets.UTF_8);
  }

  private static String urlEncode(String value) {
    return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  static final class DecodedBroadcast {
    String topic;
    String event;
    String userEvent;
    JSONObject payload;
  }
}
