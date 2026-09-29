package com.dibay.app.intro;

import android.content.Context;
import android.util.Log;
import com.dibay.app.DibayServerOrigin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * LIVE_MATCH_OR_NO_INTRO delivery.
 * Fetch Live → download complete pack → integrity verify → atomic commit.
 * Never render partial / stale-as-success.
 */
public final class DibayIntroLiveDelivery {
  public static final String TAG = "DibayIntroDelivery";

  public static final class Result {
    public final boolean canRender;
    public final String reason;
    public final String packageId;
    public final String releaseId;
    public final String packageIntegrity;

    public Result(
        boolean canRender,
        String reason,
        String packageId,
        String releaseId,
        String packageIntegrity) {
      this.canRender = canRender;
      this.reason = reason;
      this.packageId = packageId;
      this.releaseId = releaseId;
      this.packageIntegrity = packageIntegrity;
    }

    public static Result noIntro(String reason) {
      return new Result(false, reason, null, null, null);
    }
  }

  private final Context context;
  private final DibayIntroVerifiedStore store;

  public DibayIntroLiveDelivery(Context context) {
    this.context = context.getApplicationContext();
    this.store = new DibayIntroVerifiedStore(this.context);
  }

  public DibayIntroVerifiedStore store() {
    return store;
  }

  /**
   * Cold-start sync. Runs on caller thread (background).
   * Authority: always refresh Live when network origin is available.
   * Local verified package may render only after it matches CURRENT Live
   * (or offlinePolicy when Live cannot be fetched).
   * Do NOT skip Live check based on a previously cached pointer alone —
   * that breaks Admin Publish/Apply → device cold start.
   */
  public Result syncForColdStart() {
    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.isEmpty()) {
      return offlinePolicy();
    }
    try {
      JSONObject live = httpGetJson(origin + "/api/intro/device/live", 1_500);
      if (live == null || !live.optBoolean("ok", false)) {
        return offlinePolicy();
      }
      String kind = live.optString("kind", "");
      if ("NO_LIVE".equals(kind)) {
        store.writeLivePointer(live);
        return Result.noIntro("NO_LIVE");
      }
      if (!"LIVE".equals(kind)) {
        return Result.noIntro("LIVE_KIND_UNKNOWN:" + kind);
      }
      String releaseId = live.optString("releaseId", "");
      String packageId = live.optString("packageId", "");
      String packageIntegrity = live.optString("packageIntegrity", "");
      String packUrl = live.optString("packRetrievalUrl", "");
      JSONObject assetUrls = live.optJSONObject("assetRetrievalUrls");
      store.writeLivePointer(live);

      if (packageId.isEmpty() || packageIntegrity.isEmpty() || packUrl.isEmpty()) {
        return Result.noIntro("LIVE_INCOMPLETE");
      }

      if (store.hasVerifiedMatching(packageId, packageIntegrity)) {
        Log.i(TAG, "verified_match packageId=" + packageId);
        return new Result(true, "VERIFIED_MATCH", packageId, releaseId, packageIntegrity);
      }

      // F3-B: download budget hard ≤4000ms wall after metadata decides download needed.
      final long downloadDeadline = System.currentTimeMillis() + 4_000;
      byte[] packBytes = httpGetBytes(packUrl, remainingTimeout(downloadDeadline));
      if (packBytes == null || packBytes.length == 0) {
        return Result.noIntro("PACK_DOWNLOAD_FAILED");
      }
      java.util.Map<String, byte[]> assets = new java.util.HashMap<>();
      if (assetUrls != null) {
        java.util.Iterator<String> keys = assetUrls.keys();
        while (keys.hasNext()) {
          String mediaId = keys.next();
          String url = assetUrls.optString(mediaId, "");
          if (url.isEmpty()) continue;
          int assetTimeout = remainingTimeout(downloadDeadline);
          if (assetTimeout <= 0) {
            return Result.noIntro("DOWNLOAD_BUDGET_EXCEEDED");
          }
          byte[] bytes = httpGetBytes(url, assetTimeout);
          if (bytes == null || bytes.length == 0) {
            return Result.noIntro("ASSET_DOWNLOAD_FAILED:" + mediaId);
          }
          // relative path resolved after pack parse — temp key by mediaId
          assets.put("__media__" + mediaId, bytes);
        }
      }
      try {
        // Parse pack to map mediaId → relativePath
        org.json.JSONObject packRoot =
            new org.json.JSONObject(new String(packBytes, java.nio.charset.StandardCharsets.UTF_8));
        org.json.JSONObject packAssets = packRoot.optJSONObject("assets");
        java.util.Map<String, byte[]> byRel = new java.util.HashMap<>();
        if (packAssets != null) {
          java.util.Iterator<String> keys = packAssets.keys();
          while (keys.hasNext()) {
            String mediaId = keys.next();
            org.json.JSONObject a = packAssets.optJSONObject(mediaId);
            if (a == null) continue;
            String rel = a.optString("relativePath", "");
            byte[] bytes = assets.get("__media__" + mediaId);
            if (rel.isEmpty() || bytes == null) {
              return Result.noIntro("ASSET_MAP_FAILED:" + mediaId);
            }
            byRel.put(rel, bytes);
          }
        }
        store.atomicCommitVerified(packBytes, byRel, releaseId, packageId, packageIntegrity);
      } catch (Exception e) {
        Log.e(TAG, "atomic_commit_failed", e);
        store.quarantineVerified("commit_failed");
        return Result.noIntro("COMMIT_FAILED:" + e.getMessage());
      }
      return new Result(true, "DOWNLOADED_COMMITTED", packageId, releaseId, packageIntegrity);
    } catch (Exception e) {
      Log.e(TAG, "sync_failed", e);
      return offlinePolicy();
    }
  }

  private Result offlinePolicy() {
    try {
      JSONObject pointer = store.readLivePointerOrNull();
      JSONObject meta = store.readVerifiedMetaOrNull();
      if (pointer == null) {
        // First install offline / never saw Live
        return Result.noIntro("FIRST_INSTALL_OR_NO_POINTER");
      }
      if ("NO_LIVE".equals(pointer.optString("kind", ""))) {
        return Result.noIntro("NO_LIVE_CACHED");
      }
      String packageId = pointer.optString("packageId", "");
      String integrity = pointer.optString("packageIntegrity", "");
      String releaseId = pointer.optString("releaseId", "");
      if (meta != null
          && packageId.equals(meta.optString("packageId", ""))
          && integrity.equals(meta.optString("packageIntegrity", ""))
          && store.hasVerifiedMatching(packageId, integrity)) {
        return new Result(true, "OFFLINE_VERIFIED_MATCH", packageId, releaseId, integrity);
      }
      // Know Live but cannot prove match / download — no stale campaign
      return Result.noIntro("OFFLINE_LIVE_MISMATCH_OR_MISSING");
    } catch (Exception e) {
      return Result.noIntro("OFFLINE_POLICY_ERROR");
    }
  }

  private static int remainingTimeout(long deadlineMs) {
    long left = deadlineMs - System.currentTimeMillis();
    if (left <= 0) return 0;
    return (int) Math.min(4_000, left);
  }

  private static JSONObject httpGetJson(String urlStr, int timeoutMs) throws Exception {
    byte[] bytes = httpGetBytes(urlStr, timeoutMs);
    if (bytes == null) return null;
    return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
  }

  private static byte[] httpGetBytes(String urlStr, int timeoutMs) throws Exception {
    if (timeoutMs <= 0) return null;
    HttpURLConnection conn = null;
    try {
      URL url = new URL(urlStr);
      conn = (HttpURLConnection) url.openConnection();
      conn.setConnectTimeout(timeoutMs);
      conn.setReadTimeout(timeoutMs);
      conn.setRequestMethod("GET");
      conn.setInstanceFollowRedirects(true);
      int code = conn.getResponseCode();
      InputStream in = code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
      if (in == null) return null;
      ByteArrayOutputStream bos = new ByteArrayOutputStream();
      byte[] buf = new byte[8192];
      int n;
      while ((n = in.read(buf)) >= 0) {
        bos.write(buf, 0, n);
      }
      if (code < 200 || code >= 300) {
        Log.w(TAG, "http_fail code=" + code + " url=" + urlStr);
        return null;
      }
      return bos.toByteArray();
    } finally {
      if (conn != null) conn.disconnect();
    }
  }
}
