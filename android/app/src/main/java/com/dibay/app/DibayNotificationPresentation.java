package com.dibay.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.drawable.IconCompat;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/**
 * 알림 표시 SSOT 렌더러 (Owner 시안 2026-10-29).
 *
 * <p>서버 `lib/notifications/display/notification-presentation.ts` 가 정한 값(presKind·presImageUrl·
 * presImageShape·presThreadKey·presBodyTone)을 그대로 그린다. 종류·사진·묶음을 여기서 다시 판정하지 않는다.
 * 통화 알림은 이 렌더러를 쓰지 않는다(통화 규정).
 */
final class DibayNotificationPresentation {
  private static final String TAG = "DIBAY_NOTIF_PRES";
  private static final int IMAGE_CONNECT_TIMEOUT_MS = 3000;
  private static final int IMAGE_READ_TIMEOUT_MS = 3000;
  private static final int LARGE_ICON_PX = 192;
  /** 대화방 알림에 남기는 최근 메시지 수 (시안: 아래로 쌓임 · 최근 5개) */
  private static final int MAX_THREAD_MESSAGES = 5;

  static final String KIND_MESSAGE = "message";

  final String kind;
  final String imageUrl;
  final boolean circleImage;
  final String threadKey;
  final long when;
  final String senderName;
  final String roomName;
  final boolean groupConversation;

  private DibayNotificationPresentation(Map<String, String> data) {
    kind = trim(data.get("presKind"));
    imageUrl = httpsOrNull(data.get("presImageUrl"));
    circleImage = "circle".equals(trim(data.get("presImageShape")));
    threadKey = trim(data.get("presThreadKey"));
    when = parseIsoMillis(trim(data.get("createdAt")));
    senderName = trim(data.get("senderName"));
    roomName = trim(data.get("roomName"));
    String roomKind = trim(data.get("roomKind"));
    groupConversation = "group".equals(roomKind) || "group_message".equals(trim(data.get("type")));
  }

  /** 서버가 표시값을 실어 보낸 경우만 (구 서버·통화 payload 는 null → 기존 렌더 유지) */
  static DibayNotificationPresentation from(Map<String, String> data) {
    if (data == null || trim(data.get("presKind")).isEmpty()) return null;
    return new DibayNotificationPresentation(data);
  }

  boolean isMessage() {
    return KIND_MESSAGE.equals(kind);
  }

  /** 같은 묶음(대화방) 알림은 한 장으로 갱신 — 메시지만. 나머지는 기존 tag id. */
  int notificationIdOr(int fallback) {
    return isMessage() && !threadKey.isEmpty() ? ("dibay-thread-" + threadKey).hashCode() : fallback;
  }

  /**
   * 모든 일반 알림 공통: 흰 DIBAY 마크 + 브랜드 그린.
   * 묶음 키(setGroup)는 주지 않는다 — 요약 없는 1건 묶음은 Android 15·One UI·HyperOS 가 앱 자동 묶음으로
   * 바로 합쳐 메시지가 「읽지 않은 알림」 카드 밑에 숨었다(실기 2026-10-29). OS 기본 자동 묶음 기준을 따른다.
   */
  static void applyBrand(Context context, NotificationCompat.Builder builder) {
    builder.setSmallIcon(R.drawable.ic_stat_dibay);
    builder.setColor(ContextCompat.getColor(context, R.color.dibay_notification_accent));
  }

  void apply(
      Context context, NotificationCompat.Builder builder, NotificationManager nm, int notificationId, String title, String body) {
    applyBrand(context, builder);
    builder.setShowWhen(true);
    builder.setWhen(when > 0 ? when : System.currentTimeMillis());
    Bitmap image = loadLargeIcon(context);
    if (isMessage()) {
      builder.setCategory(NotificationCompat.CATEGORY_MESSAGE);
      builder.setStyle(buildMessagingStyle(nm, notificationId, title, body, image));
      return;
    }
    if (image != null) builder.setLargeIcon(image);
  }

  private NotificationCompat.MessagingStyle buildMessagingStyle(
      NotificationManager nm, int notificationId, String title, String body, Bitmap avatar) {
    Person me = new Person.Builder().setName("나").build();
    String name = !senderName.isEmpty() ? senderName : title;
    Person.Builder sender = new Person.Builder().setName(name).setKey(name);
    if (avatar != null) sender.setIcon(IconCompat.createWithBitmap(avatar));
    Person senderPerson = sender.build();

    List<NotificationCompat.MessagingStyle.Message> previous = previousMessages(nm, notificationId);
    NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(me);
    if (groupConversation) {
      style.setConversationTitle(!roomName.isEmpty() ? roomName : title);
      style.setGroupConversation(true);
    }
    int start = Math.max(0, previous.size() - (MAX_THREAD_MESSAGES - 1));
    for (int i = start; i < previous.size(); i++) {
      style.addMessage(previous.get(i));
    }
    style.addMessage(
        new NotificationCompat.MessagingStyle.Message(
            stripSenderPrefix(body, name), when > 0 ? when : System.currentTimeMillis(), senderPerson));
    return style;
  }

  /** 그룹방 body 는 서버가 `보낸사람: 미리보기` 로 만든다 — 메신저형에서는 이름이 따로 보이므로 접두를 뗀다. */
  private static String stripSenderPrefix(String body, String name) {
    String b = body != null ? body : "";
    String prefix = name + ": ";
    return !name.isEmpty() && b.startsWith(prefix) ? b.substring(prefix.length()) : b;
  }

  private static List<NotificationCompat.MessagingStyle.Message> previousMessages(
      NotificationManager nm, int notificationId) {
    List<NotificationCompat.MessagingStyle.Message> out = new ArrayList<>();
    if (nm == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return out;
    try {
      for (StatusBarNotification sbn : nm.getActiveNotifications()) {
        if (sbn.getId() != notificationId) continue;
        Notification n = sbn.getNotification();
        NotificationCompat.MessagingStyle existing =
            NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n);
        if (existing != null) out.addAll(existing.getMessages());
        break;
      }
    } catch (Throwable t) {
      Log.w(TAG, "previous_messages_failed err=" + t.getClass().getSimpleName());
    }
    return out;
  }

  /** 사람·매장 사진(https) → 실패하거나 없으면 메시지는 null(OS 이름 머리글자), 그 밖은 DIBAY 로고 */
  private Bitmap loadLargeIcon(Context context) {
    Bitmap bitmap = imageUrl != null ? downloadBitmap(imageUrl) : null;
    if (bitmap == null) {
      if (isMessage() || circleImage) return null;
      bitmap = BitmapFactory.decodeResource(context.getResources(), R.drawable.notif_large_dibay);
      if (bitmap == null) return null;
    }
    return circleImage ? toCircle(bitmap) : toRounded(bitmap);
  }

  private static Bitmap downloadBitmap(String httpsUrl) {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(httpsUrl).openConnection();
      connection.setConnectTimeout(IMAGE_CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(IMAGE_READ_TIMEOUT_MS);
      connection.setInstanceFollowRedirects(true);
      connection.connect();
      if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return null;
      try (InputStream in = connection.getInputStream()) {
        return BitmapFactory.decodeStream(in);
      }
    } catch (Throwable t) {
      Log.w(TAG, "image_load_failed err=" + t.getClass().getSimpleName());
      return null;
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private static Bitmap scaledSquare(Bitmap src) {
    int side = Math.min(src.getWidth(), src.getHeight());
    Bitmap square =
        Bitmap.createBitmap(src, (src.getWidth() - side) / 2, (src.getHeight() - side) / 2, side, side);
    return Bitmap.createScaledBitmap(square, LARGE_ICON_PX, LARGE_ICON_PX, true);
  }

  private static Bitmap toCircle(Bitmap src) {
    return clip(scaledSquare(src), LARGE_ICON_PX / 2f);
  }

  /** 시안: 매장·로고는 모서리 둥근 사각 (42px 기준 10px) */
  private static Bitmap toRounded(Bitmap src) {
    return clip(scaledSquare(src), LARGE_ICON_PX * 10f / 42f);
  }

  private static Bitmap clip(Bitmap square, float radius) {
    Bitmap out = Bitmap.createBitmap(LARGE_ICON_PX, LARGE_ICON_PX, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(out);
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setShader(new BitmapShader(square, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
    canvas.drawRoundRect(new RectF(0, 0, LARGE_ICON_PX, LARGE_ICON_PX), radius, radius, paint);
    return out;
  }

  private static long parseIsoMillis(String iso) {
    if (iso.isEmpty()) return 0L;
    String[] patterns = {"yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd'T'HH:mm:ssXXX"};
    for (String p : patterns) {
      try {
        SimpleDateFormat f = new SimpleDateFormat(p, Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        Date d = f.parse(iso);
        if (d != null) return d.getTime();
      } catch (Exception ignored) {
        // 다음 형식 시도
      }
    }
    return 0L;
  }

  private static String httpsOrNull(String v) {
    String s = trim(v);
    return s.startsWith("https://") ? s : null;
  }

  private static String trim(String v) {
    return v == null ? "" : v.trim();
  }
}
