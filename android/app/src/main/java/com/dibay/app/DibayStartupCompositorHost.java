package com.dibay.app;

import android.app.Activity;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

/**
 * REBUILD 14 P2 — thin Android Startup Compositor host.
 *
 * Duties ONLY: create/attach/detach one Activity-owned compositor surface;
 * forward lifecycle, first-frame, HOME_PRESENTATION_READY, yield.
 *
 * Must not own package/generation policy, timers, product/failure visuals,
 * Dialog/second Activity, Cap splash, or WebView visibility workarounds.
 *
 * PRODUCTION_PRESENTATION_ACTIVE = false — not Owner-visible; MainActivity MUST NOT
 * wire this host into presentation ownership until P7+ with valid content.
 */
public final class DibayStartupCompositorHost {
  public static final String TAG = "DibayStartupCompositor";

  /**
   * Frozen P2 activation boundary. Structural only; Production presentation = NO.
   */
  public static final boolean PRODUCTION_PRESENTATION_ACTIVE = false;

  private static DibayStartupCompositorHost instance;

  private final Activity activity;
  private FrameLayout surface;
  private boolean attached;
  private boolean detached;
  private boolean homeReadyForwarded;
  private boolean handoffComplete;
  private boolean destroyed;

  private DibayStartupCompositorHost(Activity activity) {
    this.activity = activity;
  }

  /** At most one host per Activity root lifecycle. */
  public static synchronized DibayStartupCompositorHost getOrCreate(Activity activity) {
    if (instance != null && !instance.destroyed && instance.activity == activity) {
      return instance;
    }
    if (instance != null && !instance.destroyed && instance.activity != activity) {
      instance.destroy();
    }
    instance = new DibayStartupCompositorHost(activity);
    return instance;
  }

  public static synchronized DibayStartupCompositorHost peek() {
    return instance;
  }

  public static synchronized void resetForTests() {
    if (instance != null) {
      instance.destroy();
    }
    instance = null;
  }

  /**
   * Attach one transparent, non-interactive surface. Does NOT paint product content.
   * Production callers must not invoke while PRODUCTION_PRESENTATION_ACTIVE is false
   * if the intent is Owner-visible presentation (P2 keeps MainActivity unwired).
   */
  public synchronized void attach() {
    if (destroyed || attached) {
      return;
    }
    ViewGroup root = activity.findViewById(android.R.id.content);
    if (root == null) {
      Log.w(TAG, "attach_skipped reason=no_content_root");
      return;
    }
    surface = new FrameLayout(activity);
    surface.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    surface.setClickable(false);
    surface.setFocusable(false);
    // Invisible structural surface only (no product paint).
    surface.setVisibility(View.GONE);
    surface.setTag(TAG);
    root.addView(
        surface,
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    attached = true;
    Log.i(TAG, "attach ok productionPresentationActive=" + PRODUCTION_PRESENTATION_ACTIVE);
  }

  public synchronized void forwardHomePresentationReady(String source) {
    if (destroyed || homeReadyForwarded) {
      return;
    }
    homeReadyForwarded = true;
    Log.i(TAG, "HOME_PRESENTATION_READY forwarded source=" + (source != null ? source : "unknown"));
  }

  public synchronized void requestHandoffYield() {
    if (destroyed || handoffComplete) {
      return;
    }
    handoffComplete = true;
    detach();
    Log.i(TAG, "handoff_yield complete");
  }

  public synchronized void detach() {
    if (destroyed || detached) {
      return;
    }
    if (surface != null) {
      ViewGroup parent = (ViewGroup) surface.getParent();
      if (parent != null) {
        parent.removeView(surface);
      }
      surface = null;
    }
    attached = false;
    detached = true;
  }

  public synchronized void onForeground() {
    // Must not create a second surface / authority.
  }

  public synchronized void onBackground() {
    // Must not create a second surface / authority.
  }

  public synchronized void destroy() {
    if (destroyed) {
      return;
    }
    detach();
    destroyed = true;
    if (instance == this) {
      instance = null;
    }
  }

  public synchronized boolean isAttached() {
    return attached && surface != null;
  }

  public synchronized boolean isDestroyed() {
    return destroyed;
  }

  public synchronized int surfaceCount() {
    return surface != null && attached ? 1 : 0;
  }
}
