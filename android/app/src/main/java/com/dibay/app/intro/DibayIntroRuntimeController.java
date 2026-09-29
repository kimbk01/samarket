package com.dibay.app.intro;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.widget.FrameLayout;
import java.io.File;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * V3 Android Intro runtime — Active Pack → native Scene timeline.
 * FIRST_FRAME_READY = authored Scene1 pixels laid out/painted (not parse/attach alone).
 * INTRO_COMPLETED = timeline completion only (not FIRST_FRAME_READY).
 */
public final class DibayIntroRuntimeController {
  public static final String TAG = "DibayIntroRuntime";

  public interface Listener {
    /** Authored Scene1 pixels ready — may release OS splash. */
    void onFirstFrameReady(JSONObject identity);

    /** Canonical timeline finished (or approved FINISH when exercised). */
    void onIntroCompleted(String reason);

    /** Fail-open abort — caller continues normal Home startup. */
    void onIntroAborted(String reason);
  }

  private final Activity activity;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private final DibayIntroAuthorityStore store;
  private Listener listener;
  private FrameLayout overlayRoot;
  private DibayIntroSceneSurface sceneSurface;
  private DibayIntroPackModel model;
  private JSONObject activeIdentity;
  private int sceneIndex = 0;
  private boolean firstFrameEmitted = false;
  private boolean completed = false;
  private boolean aborted = false;
  private boolean running = false;
  private long sceneStartedAtElapsed = 0L;
  private final Runnable sceneTick = this::onSceneTick;
  private final Runnable firstFrameWatchdog =
      () -> {
        if (!firstFrameEmitted && running && !aborted && !completed) {
          abort("FIRST_FRAME_TIMEOUT");
        }
      };

  public DibayIntroRuntimeController(Activity activity) {
    this.activity = activity;
    this.store = new DibayIntroAuthorityStore(activity);
  }

  public void setListener(Listener listener) {
    this.listener = listener;
  }

  public boolean isRunning() {
    return running && !completed && !aborted;
  }

  public boolean hasEmittedFirstFrame() {
    return firstFrameEmitted;
  }

  /**
   * Cold-start entry: ensure Active from Ready if needed, verify, attach, play.
   * Returns true when Intro presentation started.
   */
  public boolean tryStartFromLocalActive() {
    try {
      if (!store.ensureActiveFromReadyIfNeeded()) {
        Log.i(TAG, "intro_skip reason=NO_ACTIVE");
        return false;
      }
      JSONObject active = store.readActiveMetaOrNull();
      if (active == null) {
        Log.i(TAG, "intro_skip reason=NO_ACTIVE_META");
        return false;
      }
      File packFile = store.resolveActivePackFile();
      File assetsRoot = store.resolveActiveAssetsRoot();
      if (packFile == null || assetsRoot == null) {
        abort("ACTIVE_PACK_MISSING");
        return false;
      }
      String expectedIntegrity = active.optString("packIntegrity", "");
      DibayIntroPackModel.ParseResult parsed =
          DibayIntroPackModel.parseAndVerify(packFile, expectedIntegrity);
      if (!parsed.ok || parsed.model == null) {
        abort(parsed.failureCode != null ? parsed.failureCode : "PACK_PARSE_FAILED");
        return false;
      }
      model = parsed.model;
      activeIdentity = active;

      // Verify all Scene1 required local assets before showing partial Scene.
      DibayIntroPackModel.Scene scene1 = model.scenes.get(0);
      Map<String, File> mediaPaths = new HashMap<>();
      for (DibayIntroPackModel.Layer layer : scene1.layers) {
        if ("IMAGE".equals(layer.type) || "LOGO".equals(layer.type)) {
          DibayIntroPackModel.Asset asset = model.assetsByMediaRef.get(layer.mediaRefId);
          if (asset == null) {
            abort("MISSING_ASSET_AUTHORITY:" + layer.mediaRefId);
            return false;
          }
          File assetFile = new File(store.baseDir(), asset.relativePackPath);
          if (!assetFile.isFile()) {
            // relativePackPath is assets/<id>.png under Ready root
            assetFile = new File(assetsRoot, new File(asset.relativePackPath).getName());
          }
          if (!DibayIntroPackModel.verifyAssetFile(assetFile, asset.sealedIntegrity)) {
            abort("ASSET_INTEGRITY_OR_MISSING:" + asset.sealedAssetId);
            return false;
          }
          mediaPaths.put(layer.mediaRefId, assetFile);
        }
        if (("TEXT".equals(layer.type) || "CTA".equals(layer.type))
            && layer.fontAssetId != null
            && !layer.fontAssetId.isEmpty()) {
          File font = new File(store.baseDir(), "fonts/" + layer.fontAssetId);
          if (!font.isFile()) {
            abort("FONT_MISSING:" + layer.fontAssetId);
            return false;
          }
        }
      }

      attachOverlay(mediaPaths);
      running = true;
      sceneIndex = 0;
      showScene(0, /*animateFade*/ false);
      mainHandler.postDelayed(firstFrameWatchdog, 5_000L);
      Log.i(
          TAG,
          "intro_started packId="
              + model.packId
              + " revision="
              + model.publishedRevisionId
              + " scenes="
              + model.scenes.size());
      return true;
    } catch (Exception e) {
      Log.e(TAG, "intro_start_failed", e);
      abort("INTRO_START_EXCEPTION:" + e.getMessage());
      return false;
    }
  }

  private void attachOverlay(Map<String, File> mediaPaths) {
    ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
    overlayRoot = new FrameLayout(activity);
    overlayRoot.setLayoutParams(
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    overlayRoot.setClickable(true);
    overlayRoot.setFocusable(true);
    // Opaque black underlay — FADE must never reveal cream WebView underneath.
    overlayRoot.setBackgroundColor(0xFF000000);
    File fontsRoot = new File(store.baseDir(), "fonts");
    File assetsRoot;
    try {
      assetsRoot = store.resolveActiveAssetsRoot();
    } catch (Exception e) {
      assetsRoot = new File(store.baseDir(), "ready/assets");
    }
    sceneSurface = new DibayIntroSceneSurface(activity, assetsRoot, fontsRoot);
    sceneSurface.setMediaPathResolver(mediaPaths::get);
    overlayRoot.addView(
        sceneSurface,
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    decor.addView(overlayRoot);
    overlayRoot.bringToFront();
    overlayRoot.setElevation(100f);
  }

  private void showScene(int index, boolean animateFade) {
    if (model == null || index < 0 || index >= model.scenes.size()) {
      complete("TIMELINE_COMPLETE");
      return;
    }
    sceneIndex = index;
    DibayIntroPackModel.Scene scene = model.scenes.get(index);
    if (animateFade && sceneSurface != null) {
      sceneSurface
          .animate()
          .alpha(0f)
          .setDuration(120)
          .withEndAction(
              () -> {
                sceneSurface.bindScene(scene, model.compositionW, model.compositionH);
                sceneSurface.setAlpha(0f);
                sceneSurface
                    .animate()
                    .alpha(1f)
                    .setDuration(180)
                    .withEndAction(this::armSceneDuration)
                    .start();
                watchFirstFrame();
              })
          .start();
    } else if (sceneSurface != null) {
      sceneSurface.setAlpha(1f);
      sceneSurface.bindScene(scene, model.compositionW, model.compositionH);
      watchFirstFrame();
      armSceneDuration();
    }
  }

  private void watchFirstFrame() {
    if (firstFrameEmitted || sceneSurface == null || sceneIndex != 0) return;
    sceneSurface
        .getViewTreeObserver()
        .addOnPreDrawListener(
            new ViewTreeObserver.OnPreDrawListener() {
              @Override
              public boolean onPreDraw() {
                if (sceneSurface == null) return true;
                if (sceneSurface.getWidth() <= 0 || sceneSurface.getHeight() <= 0) {
                  return true;
                }
                // Require layout pass that built authored hierarchy (or empty black scene).
                sceneSurface
                    .getViewTreeObserver()
                    .removeOnPreDrawListener(this);
                sceneSurface.post(
                    () -> {
                      if (firstFrameEmitted || aborted || completed) return;
                      if (!sceneSurface.hasPaintedAuthoredPixels()
                          && sceneSurface.getChildCount() == 0
                          && model != null
                          && !model.scenes.get(0).layers.isEmpty()) {
                        // Wait one more frame for children.
                        sceneSurface.post(this::emitFirstFrameIfReady);
                        return;
                      }
                      emitFirstFrameIfReady();
                    });
                return true;
              }

              private void emitFirstFrameIfReady() {
                if (firstFrameEmitted || aborted || completed) return;
                if (sceneSurface == null) return;
                boolean hasLayers =
                    model != null
                        && !model.scenes.isEmpty()
                        && !model.scenes.get(0).layers.isEmpty();
                if (hasLayers
                    && sceneSurface.getChildCount() == 0
                    && !sceneSurface.hasPaintedAuthoredPixels()) {
                  // Layers not built yet — wait; watchdog will abort if stuck.
                  sceneSurface.postDelayed(this::emitFirstFrameIfReady, 16);
                  return;
                }
                firstFrameEmitted = true;
                Log.i(
                    TAG,
                    "INTRO_FIRST_FRAME_READY sceneIndex=0 children="
                        + sceneSurface.getChildCount());
                if (listener != null) {
                  listener.onFirstFrameReady(activeIdentity);
                }
              }
            });
  }

  private void armSceneDuration() {
    mainHandler.removeCallbacks(sceneTick);
    sceneStartedAtElapsed = SystemClock.elapsedRealtime();
    DibayIntroPackModel.Scene scene = model.scenes.get(sceneIndex);
    long delay = Math.max(0, scene.durationMs);
    mainHandler.postDelayed(sceneTick, delay);
  }

  private void onSceneTick() {
    if (!running || completed || aborted || model == null) return;
    DibayIntroPackModel.Scene scene = model.scenes.get(sceneIndex);
    DibayIntroPackModel.Transition t = scene.transitionAfter;
    int next = sceneIndex + 1;
    if (next >= model.scenes.size()) {
      complete("TIMELINE_COMPLETE");
      return;
    }
    if (t != null && "FADE".equals(t.type) && t.durationMs > 0) {
      final int fadeMs = t.durationMs;
      final int half = Math.max(1, fadeMs / 2);
      if (sceneSurface != null) {
        sceneSurface
            .animate()
            .alpha(0f)
            .setDuration(half)
            .withEndAction(
                () -> {
                  sceneIndex = next;
                  DibayIntroPackModel.Scene nextScene = model.scenes.get(next);
                  sceneSurface.bindScene(
                      nextScene, model.compositionW, model.compositionH);
                  sceneSurface.setAlpha(0f);
                  sceneSurface
                      .animate()
                      .alpha(1f)
                      .setDuration(fadeMs - half)
                      .withEndAction(this::armSceneDuration)
                      .start();
                })
            .start();
        return;
      }
    }
    if (t != null && "SLIDE".equals(t.type)) {
      Log.w(TAG, "SLIDE_PRESENT_FALLTHROUGH_CUT scene=" + scene.sceneId);
    }
    // CUT (duration 0) or missing transition → immediate next scene.
    showScene(next, /*animateFade*/ false);
  }

  private void complete(String reason) {
    if (completed || aborted) return;
    completed = true;
    running = false;
    mainHandler.removeCallbacks(sceneTick);
    mainHandler.removeCallbacks(firstFrameWatchdog);
    Log.i(TAG, "INTRO_COMPLETED reason=" + reason);
    // Do NOT remove on FIRST_FRAME — only on completion.
    removeOverlay();
    if (listener != null) listener.onIntroCompleted(reason);
  }

  private void abort(String reason) {
    if (completed || aborted) return;
    aborted = true;
    running = false;
    mainHandler.removeCallbacks(sceneTick);
    mainHandler.removeCallbacks(firstFrameWatchdog);
    Log.w(TAG, "INTRO_ABORTED reason=" + reason);
    removeOverlay();
    if (listener != null) listener.onIntroAborted(reason);
  }

  private void removeOverlay() {
    if (overlayRoot == null) return;
    try {
      ViewGroup parent = (ViewGroup) overlayRoot.getParent();
      if (parent != null) parent.removeView(overlayRoot);
    } catch (Exception ignored) {
    }
    overlayRoot = null;
    sceneSurface = null;
  }

  public void release() {
    mainHandler.removeCallbacks(sceneTick);
    mainHandler.removeCallbacks(firstFrameWatchdog);
    removeOverlay();
    running = false;
  }
}
