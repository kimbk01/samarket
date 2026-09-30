package com.dibay.app.intro;

import android.content.Context;
import android.util.Log;
import com.dibay.app.DibayServerOrigin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.json.JSONObject;

/**
 * Layer B Live delivery.
 * Fetch Live → download config + assets → integrity → atomic commit.
 * Cold may render previous verified local when download incomplete (bounded).
 */
public final class DibaySystemStartLiveDelivery {
  public static final String TAG = "DibaySystemStartDelivery";

  public static final class Result {
    public final boolean canRender;
    public final String reason;
    public final String generationId;
    public final String packageIntegrity;

    public Result(
        boolean canRender, String reason, String generationId, String packageIntegrity) {
      this.canRender = canRender;
      this.reason = reason;
      this.generationId = generationId;
      this.packageIntegrity = packageIntegrity;
    }

    public static Result noRender(String reason) {
      return new Result(false, reason, null, null);
    }
  }

  private final Context context;
  private final DibaySystemStartVerifiedStore store;

  public DibaySystemStartLiveDelivery(Context context) {
    this.context = context.getApplicationContext();
    this.store = new DibaySystemStartVerifiedStore(this.context);
  }

  public DibaySystemStartVerifiedStore store() {
    return store;
  }

  /** Background sync — call on cold and foreground. Bounded download budget. */
  public Result syncLive() {
    String origin = DibayServerOrigin.resolve(context);
    if (origin == null || origin.isEmpty()) {
      return previousVerifiedOrNone("NO_ORIGIN");
    }
    try {
      JSONObject live = httpGetJson(origin + "/api/intro/device/system-start/live", 1_500);
      if (live == null || !live.optBoolean("ok", false)) {
        return previousVerifiedOrNone("LIVE_FETCH_FAILED");
      }
      String kind = live.optString("kind", "");
      if ("NO_LIVE".equals(kind)) {
        store.writeLivePointer(live);
        store.quarantineVerified("NO_LIVE");
        return Result.noRender("NO_LIVE");
      }
      if (!"LIVE".equals(kind)) {
        return previousVerifiedOrNone("LIVE_KIND_UNKNOWN:" + kind);
      }
      String generationId = live.optString("generationId", "");
      String packageIntegrity = live.optString("packageIntegrity", "");
      String configUrl = live.optString("configRetrievalUrl", "");
      JSONObject assetUrls = live.optJSONObject("assetRetrievalUrls");
      store.writeLivePointer(live);

      if (generationId.isEmpty() || packageIntegrity.isEmpty() || configUrl.isEmpty()) {
        return previousVerifiedOrNone("LIVE_INCOMPLETE");
      }

      if (store.hasVerifiedMatching(generationId, packageIntegrity)) {
        Log.i(TAG, "verified_match generationId=" + generationId);
        return new Result(true, "VERIFIED_MATCH", generationId, packageIntegrity);
      }

      final long downloadDeadline = System.currentTimeMillis() + 4_000;
      byte[] configBytes = httpGetBytes(configUrl, remainingTimeout(downloadDeadline));
      if (configBytes == null || configBytes.length == 0) {
        return previousVerifiedOrNone("CONFIG_DOWNLOAD_FAILED");
      }
      String hex = DibayIntroPackModel.sha256Hex(configBytes);
      if (!packageIntegrity.equalsIgnoreCase(hex)) {
        return previousVerifiedOrNone("CONFIG_INTEGRITY_MISMATCH");
      }

      DibaySystemStartConfig parsed =
          DibaySystemStartConfig.parse(configBytes, generationId, packageIntegrity);
      if (parsed == null) {
        return previousVerifiedOrNone("CONFIG_PARSE_FAILED");
      }

      Map<String, byte[]> byRel = new HashMap<>();
      if (assetUrls != null) {
        Iterator<String> keys = assetUrls.keys();
        while (keys.hasNext()) {
          String mediaId = keys.next();
          String url = assetUrls.optString(mediaId, "");
          DibaySystemStartConfig.Asset asset = parsed.assetsByMediaId.get(mediaId);
          if (asset == null || asset.relativePath == null || asset.relativePath.isEmpty()) {
            return previousVerifiedOrNone("ASSET_MAP_FAILED:" + mediaId);
          }
          if (url.isEmpty()) {
            return previousVerifiedOrNone("ASSET_URL_MISSING:" + mediaId);
          }
          int assetTimeout = remainingTimeout(downloadDeadline);
          if (assetTimeout <= 0) {
            return previousVerifiedOrNone("DOWNLOAD_BUDGET_EXCEEDED");
          }
          byte[] bytes = httpGetBytes(url, assetTimeout);
          if (bytes == null || bytes.length == 0) {
            return previousVerifiedOrNone("ASSET_DOWNLOAD_FAILED:" + mediaId);
          }
          byRel.put(asset.relativePath, bytes);
        }
      }
      // Ensure every config asset was fetched.
      for (DibaySystemStartConfig.Asset asset : parsed.assetsByMediaId.values()) {
        if (!byRel.containsKey(asset.relativePath)) {
          return previousVerifiedOrNone("ASSET_MISSING_IN_LIVE:" + asset.mediaId);
        }
      }

      try {
        store.atomicCommitVerified(configBytes, byRel, generationId, packageIntegrity);
      } catch (Exception e) {
        Log.e(TAG, "atomic_commit_failed", e);
        store.quarantineVerified("commit_failed");
        return previousVerifiedOrNone("COMMIT_FAILED:" + e.getMessage());
      }
      return new Result(true, "DOWNLOADED_COMMITTED", generationId, packageIntegrity);
    } catch (Exception e) {
      Log.e(TAG, "sync_failed", e);
      return previousVerifiedOrNone("SYNC_EXCEPTION");
    }
  }

  private Result previousVerifiedOrNone(String reason) {
    DibaySystemStartConfig prev = store.readVerifiedConfigOrNull();
    if (prev != null) {
      Log.i(TAG, "previous_verified reason=" + reason + " generationId=" + prev.generationId);
      return new Result(
          true, "PREVIOUS_VERIFIED:" + reason, prev.generationId, prev.packageIntegrity);
    }
    return Result.noRender(reason);
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
