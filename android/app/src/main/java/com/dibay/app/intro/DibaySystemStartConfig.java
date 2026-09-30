package com.dibay.app.intro;

import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.json.JSONObject;

/** Parsed SystemStartLiveConfig (Layer B). */
public final class DibaySystemStartConfig {
  public final String generationId;
  public final String packageIntegrity;
  public final int backgroundArgb;
  public final String backgroundImageMediaId;
  public final boolean brandAssetEnabled;
  public final String brandAssetMediaId;
  public final float brandSizeNorm;
  public final float brandXNorm;
  public final float brandYNorm;
  public final int minVisibleMs;
  public final Map<String, Asset> assetsByMediaId;

  public static final class Asset {
    public final String mediaId;
    public final String relativePath;
    public final String integrity;

    public Asset(String mediaId, String relativePath, String integrity) {
      this.mediaId = mediaId;
      this.relativePath = relativePath;
      this.integrity = integrity;
    }
  }

  public DibaySystemStartConfig(
      String generationId,
      String packageIntegrity,
      int backgroundArgb,
      String backgroundImageMediaId,
      boolean brandAssetEnabled,
      String brandAssetMediaId,
      float brandSizeNorm,
      float brandXNorm,
      float brandYNorm,
      int minVisibleMs,
      Map<String, Asset> assetsByMediaId) {
    this.generationId = generationId;
    this.packageIntegrity = packageIntegrity;
    this.backgroundArgb = backgroundArgb;
    this.backgroundImageMediaId = backgroundImageMediaId;
    this.brandAssetEnabled = brandAssetEnabled;
    this.brandAssetMediaId = brandAssetMediaId;
    this.brandSizeNorm = brandSizeNorm;
    this.brandXNorm = brandXNorm;
    this.brandYNorm = brandYNorm;
    this.minVisibleMs = minVisibleMs;
    this.assetsByMediaId = assetsByMediaId;
  }

  public static DibaySystemStartConfig parse(
      byte[] configBytes, String expectedGenerationId, String packageIntegrity) throws Exception {
    if (configBytes == null || configBytes.length == 0) return null;
    JSONObject root = new JSONObject(new String(configBytes, StandardCharsets.UTF_8));
    String generationId = root.optString("generationId", "");
    if (generationId.isEmpty()) return null;
    if (expectedGenerationId != null
        && !expectedGenerationId.isEmpty()
        && !expectedGenerationId.equals(generationId)) {
      return null;
    }
    int bg =
        DibayIntroPackModel.parseColorHex(
            root.optString("backgroundColor", "#FFFCFC"), 0xFFFFFCFC);
    String bgMedia = root.optString("backgroundImageMediaId", "");
    if (bgMedia != null && bgMedia.isEmpty()) bgMedia = null;
    boolean brandEnabled = root.optBoolean("brandAssetEnabled", false);
    String brandMedia = root.optString("brandAssetMediaId", "");
    if (brandMedia != null && brandMedia.isEmpty()) brandMedia = null;
    float sizeNorm = (float) root.optDouble("brandSizeNorm", 0.28);
    float xNorm = (float) root.optDouble("brandXNorm", 0.5);
    float yNorm = (float) root.optDouble("brandYNorm", 0.5);
    int minMs = root.optInt("minVisibleMs", 500);
    if (minMs < 500) minMs = 500;
    if (minMs > 5000) minMs = 5000;

    Map<String, Asset> assets = new HashMap<>();
    JSONObject assetsObj = root.optJSONObject("assets");
    if (assetsObj != null) {
      Iterator<String> keys = assetsObj.keys();
      while (keys.hasNext()) {
        String mediaId = keys.next();
        JSONObject a = assetsObj.optJSONObject(mediaId);
        if (a == null) continue;
        assets.put(
            mediaId,
            new Asset(
                mediaId,
                a.optString("relativePath", ""),
                a.optString("integrity", "")));
      }
    }
    return new DibaySystemStartConfig(
        generationId,
        packageIntegrity != null ? packageIntegrity : "",
        bg,
        bgMedia,
        brandEnabled,
        brandMedia,
        sizeNorm,
        xNorm,
        yNorm,
        minMs,
        Collections.unmodifiableMap(assets));
  }

  public FileRef resolveBackgroundImage(java.io.File verifiedRoot) {
    if (backgroundImageMediaId == null || backgroundImageMediaId.isEmpty()) return null;
    Asset a = assetsByMediaId.get(backgroundImageMediaId);
    if (a == null || a.relativePath == null || a.relativePath.isEmpty()) return null;
    java.io.File f = new java.io.File(verifiedRoot, a.relativePath);
    if (!f.isFile()) return null;
    return new FileRef(f);
  }

  public FileRef resolveBrandImage(java.io.File verifiedRoot) {
    if (!brandAssetEnabled || brandAssetMediaId == null || brandAssetMediaId.isEmpty()) {
      return null;
    }
    Asset a = assetsByMediaId.get(brandAssetMediaId);
    if (a == null || a.relativePath == null || a.relativePath.isEmpty()) return null;
    java.io.File f = new java.io.File(verifiedRoot, a.relativePath);
    if (!f.isFile()) return null;
    return new FileRef(f);
  }

  public static final class FileRef {
    public final java.io.File file;

    public FileRef(java.io.File file) {
      this.file = file;
    }
  }
}
