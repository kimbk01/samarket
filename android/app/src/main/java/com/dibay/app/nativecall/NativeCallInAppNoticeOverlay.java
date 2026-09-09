package com.dibay.app.nativecall;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.dibay.app.R;

/**
 * DIBAY Call in-app notice — Android Native renderer (Voice/Video shared).
 * Product parity with Web CallInAppNoticeBanner / IncomingCallBanner geometry tokens.
 * Does not own Call lifecycle.
 */
public final class NativeCallInAppNoticeOverlay {
  public enum Event {
    PEER_BUSY,
    PEER_DECLINED,
    CALL_FAILED,
    REMOTE_ENDED,
    MISSED,
    RECONNECTING,
    NETWORK_WARNING,
    PERMISSION_REQUIRED
  }

  private static final int BANNER_HEIGHT_DP = 72;
  private static final int RADIUS_DP = 20;
  private static final int MARGIN_H_DP = 12;
  private static final int MARGIN_TOP_MIN_DP = 8;
  private static final int PRIMARY = 0xFF00754A;
  private static final int DANGER = 0xFFD93025;
  private static final int WARN_BG = 0xFF1F1F1F;

  private final Activity activity;
  private final FrameLayout host;
  private final Handler main = new Handler(Looper.getMainLooper());
  private View banner;
  private Runnable pendingDismiss;
  private Event currentEvent;

  private NativeCallInAppNoticeOverlay(Activity activity, FrameLayout host) {
    this.activity = activity;
    this.host = host;
  }

  public static NativeCallInAppNoticeOverlay attach(Activity activity) {
    if (activity == null) return null;
    View content = activity.findViewById(android.R.id.content);
    if (!(content instanceof ViewGroup)) return null;
    ViewGroup root = (ViewGroup) content;
    FrameLayout host = new FrameLayout(activity);
    host.setLayoutParams(
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    host.setClickable(false);
    host.setFocusable(false);
    root.addView(host);
    return new NativeCallInAppNoticeOverlay(activity, host);
  }

  public static Event mapTerminalReason(String reason) {
    if (reason == null) return null;
    String kind = reason.trim().toLowerCase();
    if (kind.isEmpty()) return null;
    if ("peer_busy".equals(kind)
        || "callee_busy".equals(kind)
        || "busy".equals(kind)
        || "native_engine_busy".equals(kind)) {
      return Event.PEER_BUSY;
    }
    if ("rejected".equals(kind)
        || "reject".equals(kind)
        || "declined".equals(kind)
        || "call_rejected".equals(kind)) {
      return Event.PEER_DECLINED;
    }
    if ("failed".equals(kind)
        || kind.startsWith("agora")
        || kind.startsWith("token_fetch")
        || kind.startsWith("accept_patch")
        || kind.startsWith("join_")
        || kind.contains("permission")) {
      if (kind.contains("permission") || kind.contains("mic") || kind.contains("camera")) {
        return Event.PERMISSION_REQUIRED;
      }
      return Event.CALL_FAILED;
    }
    if ("ended".equals(kind)
        || "remote_ended".equals(kind)
        || "call_ended".equals(kind)
        || "end".equals(kind)
        || "local_ended".equals(kind)
        || "remote_terminal".equals(kind)) {
      return Event.REMOTE_ENDED;
    }
    if ("missed".equals(kind)
        || "missed_call".equals(kind)
        || "call_missed".equals(kind)
        || "timeout".equals(kind)) {
      return Event.MISSED;
    }
    return null;
  }

  /** Show notice then run onComplete (e.g. Activity.finish). MAX=1. */
  public void showThen(Event event, Runnable onComplete) {
    if (event == null) {
      if (onComplete != null) onComplete.run();
      return;
    }
    activity.runOnUiThread(
        () -> {
          clearPending();
          render(event);
          long duration = durationMs(event);
          if (duration <= 0) {
            // persistent — still complete finish for terminal paths after short hold
            duration = 1600L;
          }
          pendingDismiss =
              () -> {
                dismissInternal();
                if (onComplete != null) onComplete.run();
              };
          main.postDelayed(pendingDismiss, duration);
        });
  }

  public void show(Event event) {
    if (event == null) return;
    activity.runOnUiThread(
        () -> {
          clearPending();
          render(event);
          long duration = durationMs(event);
          if (duration > 0) {
            pendingDismiss = this::dismissInternal;
            main.postDelayed(pendingDismiss, duration);
          }
        });
  }

  public void dismiss() {
    activity.runOnUiThread(this::dismissInternal);
  }

  private void render(Event event) {
    dismissInternal();
    currentEvent = event;
    Context ctx = activity;
    LinearLayout row = new LinearLayout(ctx);
    row.setOrientation(LinearLayout.HORIZONTAL);
    row.setGravity(Gravity.CENTER_VERTICAL);
    int pad = dp(12);
    row.setPadding(pad, pad, pad, pad);

    GradientDrawable bg = new GradientDrawable();
    bg.setColor(bgColor(event));
    bg.setCornerRadius(dp(RADIUS_DP));
    bg.setStroke(dp(1), borderColor(event));
    row.setBackground(bg);
    row.setElevation(dp(8));

    TextView message = new TextView(ctx);
    message.setText(messageFor(event));
    message.setTextColor(Color.WHITE);
    message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    message.setTypeface(Typeface.DEFAULT_BOLD);
    message.setMaxLines(3);
    LinearLayout.LayoutParams msgLp =
        new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    row.addView(message, msgLp);

    if (isDismissible(event)) {
      ImageButton close = new ImageButton(ctx);
      close.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
      close.setBackgroundColor(Color.TRANSPARENT);
      close.setColorFilter(Color.WHITE);
      close.setOnClickListener(v -> dismissInternal());
      row.addView(
          close,
          new LinearLayout.LayoutParams(dp(36), dp(36)));
    }

    FrameLayout.LayoutParams lp =
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
    int top = Math.max(dp(MARGIN_TOP_MIN_DP), topInset());
    lp.setMargins(dp(MARGIN_H_DP), top, dp(MARGIN_H_DP), 0);
    row.setMinimumHeight(dp(BANNER_HEIGHT_DP));
    host.addView(row, lp);
    banner = row;
  }

  private void dismissInternal() {
    clearPending();
    if (banner != null) {
      host.removeView(banner);
      banner = null;
    }
    currentEvent = null;
  }

  private void clearPending() {
    if (pendingDismiss != null) {
      main.removeCallbacks(pendingDismiss);
      pendingDismiss = null;
    }
  }

  private int topInset() {
    try {
      Insets insets =
          ViewCompat.getRootWindowInsets(host) != null
              ? ViewCompat.getRootWindowInsets(host).getInsets(WindowInsetsCompat.Type.systemBars())
              : Insets.NONE;
      return insets.top;
    } catch (RuntimeException error) {
      return dp(MARGIN_TOP_MIN_DP);
    }
  }

  private int dp(int value) {
    return Math.round(value * activity.getResources().getDisplayMetrics().density);
  }

  private static int bgColor(Event event) {
    switch (event) {
      case CALL_FAILED:
      case PERMISSION_REQUIRED:
        return DANGER;
      case NETWORK_WARNING:
        return WARN_BG;
      case PEER_BUSY:
      case PEER_DECLINED:
      case REMOTE_ENDED:
      case MISSED:
      case RECONNECTING:
      default:
        return PRIMARY;
    }
  }

  private static int borderColor(Event event) {
    return Color.argb(0x66, Color.red(bgColor(event)), Color.green(bgColor(event)), Color.blue(bgColor(event)));
  }

  private static long durationMs(Event event) {
    switch (event) {
      case RECONNECTING:
      case PERMISSION_REQUIRED:
        return 0L;
      case REMOTE_ENDED:
        return 3600L;
      case CALL_FAILED:
        return 4800L;
      default:
        return 4200L;
    }
  }

  private static boolean isDismissible(Event event) {
    return event != Event.RECONNECTING;
  }

  private String messageFor(Event event) {
    int res;
    switch (event) {
      case PEER_BUSY:
        res = R.string.dibay_call_notice_peer_busy;
        break;
      case PEER_DECLINED:
        res = R.string.dibay_call_notice_peer_declined;
        break;
      case CALL_FAILED:
        res = R.string.dibay_call_notice_call_failed;
        break;
      case REMOTE_ENDED:
        res = R.string.dibay_call_notice_remote_ended;
        break;
      case MISSED:
        res = R.string.dibay_call_notice_missed;
        break;
      case RECONNECTING:
        res = R.string.dibay_call_notice_reconnecting;
        break;
      case NETWORK_WARNING:
        res = R.string.dibay_call_notice_network_warning;
        break;
      case PERMISSION_REQUIRED:
        res = R.string.dibay_call_notice_permission_required;
        break;
      default:
        res = R.string.dibay_call_notice_call_failed;
        break;
    }
    try {
      return activity.getString(res);
    } catch (RuntimeException error) {
      return "";
    }
  }
}
