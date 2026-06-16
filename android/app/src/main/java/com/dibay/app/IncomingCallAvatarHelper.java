package com.dibay.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.widget.ImageView;
import android.widget.TextView;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Lightweight avatar bind — no extra image library. */
public final class IncomingCallAvatarHelper {
  private static final Handler MAIN = new Handler(Looper.getMainLooper());

  private IncomingCallAvatarHelper() {}

  public static void bind(
      ImageView avatarView, TextView initialView, String avatarUrl, String displayName) {
    if (avatarView == null) return;
    String initial = IncomingCallUiCopy.peerInitial(displayName);
    if (initialView != null) {
      initialView.setText(initial);
      initialView.setVisibility(android.view.View.VISIBLE);
    }
    avatarView.setImageDrawable(null);
    avatarView.setBackgroundResource(R.drawable.bg_dibay_incoming_avatar);
    String url = avatarUrl != null ? avatarUrl.trim() : "";
    if (url.isEmpty()) return;
    new Thread(() -> loadInto(avatarView, initialView, url)).start();
  }

  private static void loadInto(ImageView avatarView, TextView initialView, String url) {
    try {
      HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
      connection.setConnectTimeout(4_000);
      connection.setReadTimeout(4_000);
      connection.setInstanceFollowRedirects(true);
      connection.connect();
      if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return;
      InputStream stream = connection.getInputStream();
      Bitmap bitmap = BitmapFactory.decodeStream(stream);
      stream.close();
      connection.disconnect();
      if (bitmap == null) return;
      MAIN.post(
          () -> {
            if (avatarView.getWindowToken() == null) {
              bitmap.recycle();
              return;
            }
            avatarView.setImageDrawable(new BitmapDrawable(avatarView.getResources(), bitmap));
            if (initialView != null) initialView.setVisibility(android.view.View.GONE);
          });
    } catch (Exception ignored) {
      // keep initial fallback
    }
  }

  public static void styleInitial(TextView initialView) {
    if (initialView == null) return;
    initialView.setTextColor(initialView.getResources().getColor(R.color.dibay_incoming_primary));
    initialView.setTypeface(Typeface.DEFAULT_BOLD);
    initialView.setTextAlignment(android.view.View.TEXT_ALIGNMENT_CENTER);
    initialView.setGravity(android.view.Gravity.CENTER);
    initialView.setBackgroundColor(Color.TRANSPARENT);
  }
}
