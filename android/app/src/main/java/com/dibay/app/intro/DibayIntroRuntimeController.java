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
  /**
   * Scene duration clock stays paused while Layer B covers Intro.
   * Prevents Intro finishing under System Start (Owner: Intro never shown).
   */
  private boolean presentationReleased = false;
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
    ViewGroup host = (ViewGroup) activity.findViewById(android.R.id.content);
    if (host == null) {
      host = (ViewGroup) activity.getWindow().getDecorView();
    }
    overlayRoot = new FrameLayout(activity);
    overlayRoot.setLayoutParams(
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    overlayRoot.setClickable(true);
    overlayRoot.setFocusable(true);
    // Continuity under Layer B: Scene1 pack color — NEVER build-bound SS resource.
    // Build-bound green flash over Live Layer B is a product defect.
    int holdColor = resolveScene1HoldColor();
    overlayRoot.setBackgroundColor(holdColor);
    // Stay under Layer B System Start (elevation 100) until MainActivity dismisses B.
    overlayRoot.setElevation(40f);
    sceneSurface = new DibayIntroSceneSurface(activity);
    sceneSurface.setMediaFiles(mediaFiles);
    sceneSurface.setCtaListener(this::onCta);
    overlayRoot.addView(
        sceneSurface,
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    host.addView(overlayRoot);
  }

  /** Scene1 COLOR background, else verified Layer B continuity, else cream — not build stamp. */
  private int resolveScene1HoldColor() {
    try {
      if (model != null && model.scenes != null && !model.scenes.isEmpty()) {
        DibayIntroPackModel.Scene s0 = model.scenes.get(0);
        if (s0 != null) {
          return s0.backgroundArgb;
        }
      }
    } catch (Exception ignored) {
      /* fall through */
    }
    try {
      DibaySystemStartConfig ss =
          new DibaySystemStartVerifiedStore(activity).readVerifiedConfigOrNull();
      if (ss != null) return ss.backgroundArgb;
    } catch (Exception ignored) {
      /* fall through */
    }
    return android.graphics.Color.parseColor("#FFFCFC");
  }

  private void onCta(String actionType, String destination) {
    if (aborted || completed) return;
    if ("NEXT_SCENE".equals(actionType)) {
      mainHandler.removeCallbacks(sceneTick);
      int next = sceneIndex + 1;
      if (next >= (model != null ? model.scenes.size() : 0)) {
        complete("CTA_FINISH");
      } else {
        showScene(next);
      }
    } else if ("FINISH_INTRO".equals(actionType)) {
      complete("CTA_FINISH");
    } else if ("INTERNAL_DESTINATION".equals(actionType)) {
      complete("CTA_DESTINATION:" + (destination != null ? destination : ""));
      // Web navigation is applied after handoff by MainActivity/JS bridge consumers.
    }
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
    if (presentationReleased) {
      mainHandler.postDelayed(sceneTick, Math.max(100, scene.durationMs));
    } else {
      Log.i(TAG, "intro_timeline_paused_until_layer_b_dismiss");
    }
  }

  /**
   * Call when Layer B is dismissed (or when there is no Layer B).
   * Starts/restarts the current scene duration so Intro is fully visible.
   */
  public void releasePresentationGate() {
    mainHandler.post(
        () -> {
          if (presentationReleased) return;
          presentationReleased = true;
          if (overlayRoot != null) {
            overlayRoot.setElevation(120f);
            overlayRoot.bringToFront();
          }
          if (!running || aborted || completed || model == null || sceneSurface == null) {
            Log.i(TAG, "intro_presentation_released idle");
            return;
          }
          DibayIntroPackModel.Scene scene = model.scenes.get(sceneIndex);
          mainHandler.removeCallbacks(sceneTick);
          mainHandler.postDelayed(sceneTick, Math.max(100, scene.durationMs));
          Log.i(
              TAG,
              "intro_presentation_released sceneIndex="
                  + sceneIndex
                  + " durationMs="
                  + scene.durationMs);
        });
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
    DibayIntroPackModel.Scene current = model.scenes.get(sceneIndex);
    if ("FADE".equals(current.transitionType)) {
      runCrossfadeTo(next, Math.max(100, current.transitionDurationMs));
      return;
    }
    if (current.slideDirection != null) {
      runSlideTo(next, Math.max(100, current.transitionDurationMs), current.slideDirection);
      return;
    }
    showScene(next);
  }

  /** True crossfade: A + B simultaneous. No black interstitial. */
  private void runCrossfadeTo(int nextIndex, int durationMs) {
    if (model == null || sceneSurface == null || overlayRoot == null) {
      abort("FADE_NO_SURFACE");
      return;
    }
    DibayIntroPackModel.Scene nextScene = model.scenes.get(nextIndex);
    DibayIntroSceneSurface incoming = new DibayIntroSceneSurface(activity);
    incoming.setMediaFiles(mediaFilesSnapshot());
    incoming.setCtaListener(this::onCta);
    FrameLayout.LayoutParams lp =
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    incoming.setAlpha(0f);
    overlayRoot.addView(incoming, lp);
    incoming.bindScene(nextScene, model.compositionW, model.compositionH);
    final DibayIntroSceneSurface outgoing = sceneSurface;
    outgoing
        .animate()
        .alpha(0f)
        .setDuration(durationMs)
        .start();
    incoming
        .animate()
        .alpha(1f)
        .setDuration(durationMs)
        .withEndAction(
            () -> {
              if (aborted || completed) return;
              overlayRoot.removeView(outgoing);
              sceneSurface = incoming;
              sceneIndex = nextIndex;
              watchFirstFrame();
              mainHandler.removeCallbacks(sceneTick);
              mainHandler.postDelayed(sceneTick, Math.max(100, nextScene.durationMs));
            })
        .start();
  }


  /** Outgoing + incoming simultaneous slide (no black interstitial). */
  private void runSlideTo(int nextIndex, int durationMs, String direction) {
    if (model == null || sceneSurface == null || overlayRoot == null) {
      abort("SLIDE_NO_SURFACE");
      return;
    }
    DibayIntroPackModel.Scene nextScene = model.scenes.get(nextIndex);
    DibayIntroSceneSurface incoming = new DibayIntroSceneSurface(activity);
    incoming.setMediaFiles(mediaFilesSnapshot());
    incoming.setCtaListener(this::onCta);
    int width = overlayRoot.getWidth();
    int height = overlayRoot.getHeight();
    float outTx = 0f;
    float outTy = 0f;
    float inStartTx = 0f;
    float inStartTy = 0f;
    String axis = direction != null ? direction : "LEFT";
    switch (axis) {
      case "RIGHT":
        outTx = width;
        inStartTx = -width;
        break;
      case "UP":
        outTy = -height;
        inStartTy = height;
        break;
      case "DOWN":
        outTy = height;
        inStartTy = -height;
        break;
      case "LEFT":
      default:
        outTx = -width;
        inStartTx = width;
        break;
    }
    FrameLayout.LayoutParams lp =
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    incoming.setTranslationX(inStartTx);
    incoming.setTranslationY(inStartTy);
    overlayRoot.addView(incoming, lp);
    incoming.bindScene(nextScene, model.compositionW, model.compositionH);
    final DibayIntroSceneSurface outgoing = sceneSurface;
    outgoing
        .animate()
        .translationX(outTx)
        .translationY(outTy)
        .setDuration(durationMs)
        .start();
    incoming
        .animate()
        .translationX(0f)
        .translationY(0f)
        .setDuration(durationMs)
        .withEndAction(
            () -> {
              if (aborted || completed) return;
              overlayRoot.removeView(outgoing);
              sceneSurface = incoming;
              sceneIndex = nextIndex;
              watchFirstFrame();
              mainHandler.removeCallbacks(sceneTick);
              mainHandler.postDelayed(sceneTick, Math.max(100, nextScene.durationMs));
            })
        .start();
  }

  private Map<String, File> mediaFilesSnapshot() {
    Map<String, File> out = new HashMap<>();
    if (model == null) return out;
    File verifiedRoot = delivery.store().verifiedDir();
    for (DibayIntroPackModel.Asset asset : model.assetsByMediaId.values()) {
      out.put(asset.mediaId, new File(verifiedRoot, asset.relativePath));
    }
    return out;
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
    // Keep painted Intro until Home handoff — removing here exposes WebView early.
    final boolean keepVisibleUntilHome = firstFrameEmitted;
    mainHandler.post(
        () -> {
          if (!keepVisibleUntilHome) {
            removeOverlay();
          }
          if (listener != null) listener.onIntroAborted(reason);
        });
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
