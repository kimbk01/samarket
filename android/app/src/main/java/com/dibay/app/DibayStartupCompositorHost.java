package com.dibay.app;

import android.app.Activity;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

/**
 * REBUILD 14 P7 — Android Startup Compositor host.
 *
 * Duties: create/attach/detach one Activity-owned compositor surface;
 * forward lifecycle, first-frame, HOME_PRESENTATION_READY, yield.
 * Session paints product frames onto {@link #surfaceOrNull()}.
 *
 * Must not own package/generation policy, Cap splash, or WebView workarounds.
 * Must not resurrect Bridge / second Activity / Dialog Intro.
 */
public final class DibayStartupCompositorHost {
  public static final String TAG = "DibayStartupCompositor";

  /** P7: production presentation path is active (Owner-visible when envelope present). */
  public static final boolean PRODUCTION_PRESENTATION_ACTIVE = true;

  private static DibayStartupCompositorHost instance;

  private final Activity activity;
  private FrameLayout surface;
  private boolean attached;
  private boolean detached;
  private boolean homeReadyForwarded;
  private boolean handoffComplete;
  private boolean destroyed;
  private boolean firstFrameLogged;
  private boolean ownerVisibleLogged;

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
   * Attach one full-screen compositor surface. Starts GONE until session paints.
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
    surface.setClickable(true);
    surface.setFocusable(true);
    surface.setVisibility(View.GONE);
    surface.setTag(TAG);
    root.addView(
        surface,
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    attached = true;
    Log.i(TAG, "attach ok productionPresentationActive=" + PRODUCTION_PRESENTATION_ACTIVE);
  }

  public synchronized FrameLayout surfaceOrNull() {
    return attached && !destroyed ? surface : null;
  }

  public synchronized void setSurfaceVisible(boolean visible) {
    if (surface == null) return;
    surface.setVisibility(visible ? View.VISIBLE : View.GONE);
  }

  public synchronized void notifyPaintable() {
    Log.i(TAG, "PAINTABLE");
  }

  public synchronized void notifyFirstFrameCommitted() {
    if (firstFrameLogged) return;
    firstFrameLogged = true;
    Log.i(TAG, "FIRST_FRAME_COMMITTED");
  }

  public synchronized void notifyOwnerVisible() {
    if (ownerVisibleLogged) return;
    ownerVisibleLogged = true;
    Log.i(TAG, "OWNER_VISIBLE");
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
