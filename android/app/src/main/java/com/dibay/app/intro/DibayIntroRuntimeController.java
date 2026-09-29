package com.dibay.app.intro;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import java.io.File;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * 13th runtime — VERIFIED local package only.
 * LIVE_MATCH_OR_NO_INTRO: sync first, then render verified Scene1.
 */
public final class DibayIntroRuntimeController {
  public static final String TAG = "DibayIntroRuntime";

  public interface Listener {
    void onFirstFrameReady(JSONObject identity);

    void onIntroCompleted(String reason);

    void onIntroAborted(String reason);
  }

  private final Activity activity;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private final DibayIntroLiveDelivery delivery;
  private Listener listener;
  private FrameLayout overlayRoot;
  private DibayIntroSceneSurface sceneSurface;
  private DibayIntroPackModel model;
  private JSONObject identity;
  private int sceneIndex = 0;
  private boolean firstFrameEmitted = false;
  private boolean completed = false;
  private boolean aborted = false;
  private boolean running = false;
  private final Runnable sceneTick = this::onSceneTick;
  private final Runnable firstFrameWatchdog =
      () -> {
        if (!firstFrameEmitted && running && !aborted && !completed) {
          abort("FIRST_FRAME_TIMEOUT");
        }
      };

  public DibayIntroRuntimeController(Activity activity) {
    this.activity = activity;
    this.delivery = new DibayIntroLiveDelivery(activity);
  }

  public void setListener(Listener listener) {
    this.listener = listener;
  }

  public boolean isRunning() {
    return running && !completed && !aborted;
  }

  /**
   * Blocking sync + start. Call off main thread for network; this method
   * posts UI attach to main. Returns whether Intro presentation started.
   */
  public boolean tryStartWithLiveMatchPolicy() {
    DibayIntroLiveDelivery.Result sync = delivery.syncForColdStart();
    Log.i(TAG, "sync reason=" + sync.reason + " canRender=" + sync.canRender);
    if (!sync.canRender) {
      Log.i(TAG, "intro_skip reason=" + sync.reason);
      return false;
    }
    try {
      File packFile = delivery.store().verifiedPackFile();
      DibayIntroPackModel.ParseResult parsed =
          DibayIntroPackModel.parseAndVerify(packFile, sync.packageIntegrity);
      if (!parsed.ok || parsed.model == null) {
        delivery.store().quarantineVerified(parsed.failureCode);
        abort(parsed.failureCode != null ? parsed.failureCode : "PACK_PARSE_FAILED");
        return false;
      }
      model = parsed.model;
      identity = new JSONObject();
      identity.put("packageId", model.packageId);
      identity.put("releaseId", model.releaseId);
      identity.put("packageIntegrity", model.packageIntegrity);
      identity.put("syncReason", sync.reason);

      final Map<String, File> mediaFiles = new HashMap<>();
      File verifiedRoot = delivery.store().verifiedDir();
      for (DibayIntroPackModel.Asset asset : model.assetsByMediaId.values()) {
        File f = new File(verifiedRoot, asset.relativePath);
        if (!f.isFile()) {
          delivery.store().quarantineVerified("asset_missing_at_render");
          abort("ASSET_MISSING:" + asset.mediaId);
          return false;
        }
        mediaFiles.put(asset.mediaId, f);
      }

      final boolean[] started = {false};
      final Object lock = new Object();
      mainHandler.post(
          () -> {
            try {
              attachOverlay(mediaFiles);
              running = true;
              sceneIndex = 0;
              showScene(0);
              mainHandler.postDelayed(firstFrameWatchdog, 5_000L);
              started[0] = true;
              Log.i(
                  TAG,
                  "intro_started packageId="
                      + model.packageId
                      + " scenes="
                      + model.scenes.size());
            } catch (Exception e) {
              Log.e(TAG, "attach_failed", e);
              abort("ATTACH_FAILED");
            } finally {
              synchronized (lock) {
                lock.notifyAll();
              }
            }
          });
      synchronized (lock) {
        lock.wait(3_000L);
      }
      return started[0];
    } catch (Exception e) {
      Log.e(TAG, "intro_start_failed", e);
      abort("INTRO_START_EXCEPTION:" + e.getMessage());
      return false;
    }
  }

  private void attachOverlay(Map<String, File> mediaFiles) {
    ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
    overlayRoot = new FrameLayout(activity);
    overlayRoot.setLayoutParams(
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    overlayRoot.setClickable(true);
    overlayRoot.setFocusable(true);
    overlayRoot.setBackgroundColor(0xFF000000);
    sceneSurface = new DibayIntroSceneSurface(activity);
    sceneSurface.setMediaFiles(mediaFiles);
    overlayRoot.addView(
        sceneSurface,
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    decor.addView(overlayRoot);
  }

  private void showScene(int index) {
    if (model == null || index < 0 || index >= model.scenes.size()) {
      complete("NO_MORE_SCENES");
      return;
    }
    sceneIndex = index;
    DibayIntroPackModel.Scene scene = model.scenes.get(index);
    sceneSurface.bindScene(scene, model.compositionW, model.compositionH);
    watchFirstFrame();
    mainHandler.removeCallbacks(sceneTick);
    mainHandler.postDelayed(sceneTick, Math.max(100, scene.durationMs));
  }

  private void watchFirstFrame() {
    if (firstFrameEmitted) return;
    sceneSurface.post(
        new Runnable() {
          int attempts = 0;

          @Override
          public void run() {
            if (firstFrameEmitted || aborted || completed) return;
            if (sceneSurface.hasPaintedAuthoredPixels()
                || sceneSurface.getChildCount() > 0
                || (model != null
                    && !model.scenes.isEmpty()
                    && model.scenes.get(0).elements.isEmpty())) {
              emitFirstFrame();
              return;
            }
            attempts++;
            if (attempts > 120) {
              abort("FIRST_FRAME_NOT_PAINTED");
              return;
            }
            sceneSurface.postDelayed(this, 16);
          }
        });
  }

  private void emitFirstFrame() {
    if (firstFrameEmitted || aborted) return;
    firstFrameEmitted = true;
    mainHandler.removeCallbacks(firstFrameWatchdog);
    if (listener != null) {
      listener.onFirstFrameReady(identity != null ? identity : new JSONObject());
    }
  }

  private void onSceneTick() {
    if (aborted || completed || model == null) return;
    int next = sceneIndex + 1;
    if (next >= model.scenes.size()) {
      complete("TIMELINE_DONE");
      return;
    }
    // V0: CUT only between scenes
    DibayIntroPackModel.Scene current = model.scenes.get(sceneIndex);
    if ("FADE".equals(current.transitionType) || "SLIDE".equals(current.transitionType)) {
      // Not yet implemented — fail closed (no silent CUT fallback)
      abort("TRANSITION_NOT_IMPLEMENTED:" + current.transitionType);
      return;
    }
    showScene(next);
  }

  private void complete(String reason) {
    if (completed || aborted) return;
    completed = true;
    running = false;
    mainHandler.removeCallbacks(sceneTick);
    mainHandler.removeCallbacks(firstFrameWatchdog);
    if (listener != null) listener.onIntroCompleted(reason);
  }

  private void abort(String reason) {
    if (aborted || completed) return;
    aborted = true;
    running = false;
    mainHandler.removeCallbacks(sceneTick);
    mainHandler.removeCallbacks(firstFrameWatchdog);
    mainHandler.post(this::removeOverlay);
    if (listener != null) listener.onIntroAborted(reason);
  }

  public void removeOverlay() {
    if (overlayRoot != null) {
      ViewGroup parent = (ViewGroup) overlayRoot.getParent();
      if (parent != null) parent.removeView(overlayRoot);
      overlayRoot = null;
      sceneSurface = null;
    }
  }

  /** Hold last frame until Home ready, then remove. */
  public void dismissAfterHandoff() {
    removeOverlay();
  }
}
