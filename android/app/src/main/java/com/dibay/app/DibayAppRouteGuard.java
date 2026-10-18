package com.dibay.app;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * LINK-02 — single gate for every path MainActivity hands to the WebView router
 * (push extras, dibay:// deep links, https App Links, persisted pending routes).
 *
 * Pure JVM (no android.* imports) so it is unit-testable without Robolectric.
 * Accepts only same-origin app paths whose first segment is a real app route
 * (app/(main)/* and app/* pages). Rejects protocol-relative "//host", backslash
 * ("/\host" → off-origin in WHATWG URL), control characters and unknown roots.
 * Call routes (/community-messenger/calls/…, /community-messenger/calls-v4/…) pass unchanged.
 */
public final class DibayAppRouteGuard {

  /** Keep in sync with app/(main)/* and app/* route folders (see vitest android-route-guard-sync). */
  static final Set<String> ALLOWED_ROOT_SEGMENTS =
      Collections.unmodifiableSet(
          new HashSet<>(
              Arrays.asList(
                  "account", "address", "admin", "auth", "biz", "business-info", "chat", "chats",
                  "community", "community-messenger", "delivery", "events", "features", "group",
                  "group-chat", "home", "login", "market", "my", "mypage", "notifications",
                  "onboarding", "orders", "philife", "post", "posts", "privacy", "products",
                  "regions", "rider", "search", "services", "settings", "shop", "signup", "stores",
                  "support", "terms", "u", "write")));

  private DibayAppRouteGuard() {}

  /** @return the trimmed path when safe, otherwise null (caller must not navigate). */
  public static String safeAppPath(String raw) {
    if (raw == null) return null;
    String path = raw.trim();
    if (path.isEmpty() || path.charAt(0) != '/') return null;
    if (path.startsWith("//")) return null;
    for (int i = 0; i < path.length(); i++) {
      char c = path.charAt(i);
      if (c < 0x20 || c == 0x7f || c == '\\') return null;
    }
    if (path.equals("/")) return path;
    int end = path.length();
    for (int i = 1; i < path.length(); i++) {
      char c = path.charAt(i);
      if (c == '/' || c == '?' || c == '#') {
        end = i;
        break;
      }
    }
    String root = path.substring(1, end);
    if (root.isEmpty()) {
      // "/?x" or "/#x" — home with query/fragment.
      return path.length() > 1 && (path.charAt(1) == '?' || path.charAt(1) == '#') ? path : null;
    }
    return ALLOWED_ROOT_SEGMENTS.contains(root) ? path : null;
  }
}
