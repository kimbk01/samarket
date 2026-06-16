package com.dibay.app;

/** Resolve profile avatar URLs for native incoming UI (FCM may send relative paths). */
public final class IncomingCallAvatarUrl {
  private static final String DEFAULT_ORIGIN = "https://samarket.vercel.app";

  private IncomingCallAvatarUrl() {}

  public static String resolveAbsolute(String url) {
    if (url == null) return null;
    String trimmed = url.trim();
    if (trimmed.isEmpty()) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    String base = DEFAULT_ORIGIN;
    if (trimmed.startsWith("/")) {
      return base + trimmed;
    }
    return base + "/" + trimmed;
  }
}
