package com.dibay.app.intro;

import android.content.Context;
import android.util.Log;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.json.JSONObject;

/**
 * Layer B local authority — ONE verified System Start generation.
 * Cold renderer reads verified/ only (config.json + sealed assets).
 */
public final class DibaySystemStartVerifiedStore {
  public static final String TAG = "DibaySystemStartStore";

  private final File base;

  public DibaySystemStartVerifiedStore(Context context) {
    this.base = new File(context.getFilesDir(), "dibay-system-start");
  }

  public File baseDir() {
    return base;
  }

  public File verifiedDir() {
    return new File(base, "verified");
  }

  public File verifiedConfigFile() {
    return new File(verifiedDir(), "config.json");
  }

  public File verifiedMetaFile() {
    return new File(verifiedDir(), "meta.json");
  }

  public File livePointerFile() {
    return new File(base, "live-pointer.json");
  }

  public File stagingDir() {
    return new File(base, "staging");
  }

  public JSONObject readVerifiedMetaOrNull() throws Exception {
    File meta = verifiedMetaFile();
    if (!meta.isFile()) return null;
    return new JSONObject(new String(readAllBytes(meta), StandardCharsets.UTF_8));
  }

  public DibaySystemStartConfig readVerifiedConfigOrNull() {
    try {
      JSONObject meta = readVerifiedMetaOrNull();
      File config = verifiedConfigFile();
      if (meta == null || !config.isFile()) return null;
      String integrity = meta.optString("packageIntegrity", "");
      String generationId = meta.optString("generationId", "");
      if (integrity.isEmpty() || generationId.isEmpty()) return null;
      if (!hasVerifiedMatching(generationId, integrity)) return null;
      return DibaySystemStartConfig.parse(readAllBytes(config), generationId, integrity);
    } catch (Exception e) {
      Log.w(TAG, "read_verified_config_failed", e);
      return null;
    }
  }

  public boolean hasVerifiedMatching(String generationId, String packageIntegrity) throws Exception {
    JSONObject meta = readVerifiedMetaOrNull();
    if (meta == null) return false;
    if (!generationId.equals(meta.optString("generationId", ""))) return false;
    if (!packageIntegrity.equals(meta.optString("packageIntegrity", ""))) return false;
    File config = verifiedConfigFile();
    if (!config.isFile()) return false;
    byte[] bytes = readAllBytes(config);
    String hex = DibayIntroPackModel.sha256Hex(bytes);
    if (!packageIntegrity.equalsIgnoreCase(hex)) return false;
    DibaySystemStartConfig parsed =
        DibaySystemStartConfig.parse(bytes, generationId, packageIntegrity);
    if (parsed == null) return false;
    for (DibaySystemStartConfig.Asset asset : parsed.assetsByMediaId.values()) {
      File f = new File(verifiedDir(), asset.relativePath);
      if (!f.isFile()) return false;
    }
    return true;
  }

  public boolean hasAnyVerified() {
    try {
      return readVerifiedConfigOrNull() != null;
    } catch (Exception e) {
      return false;
    }
  }

  public void writeLivePointer(JSONObject live) throws Exception {
    ensureDir(base);
    atomicWriteJson(livePointerFile(), live);
  }

  public JSONObject readLivePointerOrNull() throws Exception {
    File f = livePointerFile();
    if (!f.isFile()) return null;
    return new JSONObject(new String(readAllBytes(f), StandardCharsets.UTF_8));
  }

  public void atomicCommitVerified(
      byte[] configBytes,
      Map<String, byte[]> assetBytesByRelativePath,
      String generationId,
      String packageIntegrity)
      throws Exception {
    File staging = stagingDir();
    deleteRecursive(staging);
    if (!staging.mkdirs()) {
      throw new IllegalStateException("staging_mkdir_failed");
    }
    File stagingConfig = new File(staging, "config.json");
    FileOutputStream out = new FileOutputStream(stagingConfig);
    try {
      out.write(configBytes);
      out.flush();
    } finally {
      out.close();
    }
    String hex = DibayIntroPackModel.sha256Hex(configBytes);
    if (!packageIntegrity.equalsIgnoreCase(hex)) {
      deleteRecursive(staging);
      throw new IllegalStateException("config_integrity_mismatch");
    }
    DibaySystemStartConfig parsed =
        DibaySystemStartConfig.parse(configBytes, generationId, packageIntegrity);
    if (parsed == null) {
      deleteRecursive(staging);
      throw new IllegalStateException("config_parse_failed");
    }
    if (!generationId.equals(parsed.generationId)) {
      deleteRecursive(staging);
      throw new IllegalStateException("generation_id_mismatch");
    }
    if (assetBytesByRelativePath != null) {
      for (Map.Entry<String, byte[]> e : assetBytesByRelativePath.entrySet()) {
        File assetFile = new File(staging, e.getKey());
        File parent = assetFile.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
          throw new IllegalStateException("asset_mkdir_failed");
        }
        FileOutputStream aout = new FileOutputStream(assetFile);
        try {
          aout.write(e.getValue());
          aout.flush();
        } finally {
          aout.close();
        }
      }
    }
    for (DibaySystemStartConfig.Asset asset : parsed.assetsByMediaId.values()) {
      File f = new File(staging, asset.relativePath);
      if (!f.isFile()) {
        deleteRecursive(staging);
        throw new IllegalStateException("asset_missing:" + asset.mediaId);
      }
      if (asset.integrity != null && asset.integrity.startsWith("sha256:")) {
        String assetHex = DibayIntroPackModel.sha256Hex(readAllBytes(f));
        if (!asset.integrity.substring("sha256:".length()).equalsIgnoreCase(assetHex)) {
          deleteRecursive(staging);
          throw new IllegalStateException("asset_integrity:" + asset.mediaId);
        }
      }
    }

    JSONObject meta = new JSONObject();
    meta.put("generationId", generationId);
    meta.put("packageIntegrity", packageIntegrity);
    meta.put("committedAt", System.currentTimeMillis());
    atomicWriteJson(new File(staging, "meta.json"), meta);

    File verifiedTmp = new File(base, "verified.tmp");
    deleteRecursive(verifiedTmp);
    if (!staging.renameTo(verifiedTmp)) {
      copyDir(staging, verifiedTmp);
      deleteRecursive(staging);
    }

    File verified = verifiedDir();
    File verifiedOld = new File(base, "verified.old");
    deleteRecursive(verifiedOld);
    if (verified.exists() && !verified.renameTo(verifiedOld)) {
      deleteRecursive(verifiedTmp);
      throw new IllegalStateException("verified_backup_failed");
    }
    if (!verifiedTmp.renameTo(verified)) {
      if (verifiedOld.exists()) {
        //noinspection ResultOfMethodCallIgnored
        verifiedOld.renameTo(verified);
      }
      throw new IllegalStateException("atomic_rename_failed");
    }
    deleteRecursive(verifiedOld);
    Log.i(TAG, "atomic_commit ok generationId=" + generationId);
  }

  public void quarantineVerified(String reason) {
    try {
      File q = new File(base, "quarantine-" + System.currentTimeMillis());
      File verified = verifiedDir();
      if (verified.exists()) {
        //noinspection ResultOfMethodCallIgnored
        verified.renameTo(q);
        Log.w(TAG, "quarantine reason=" + reason);
      }
    } catch (Exception e) {
      Log.e(TAG, "quarantine_failed", e);
    }
  }

  private static void ensureDir(File d) {
    if (!d.exists() && !d.mkdirs()) {
      throw new IllegalStateException("mkdir_failed:" + d.getAbsolutePath());
    }
  }

  private static void atomicWriteJson(File file, JSONObject obj) throws Exception {
    File tmp = new File(file.getAbsolutePath() + ".tmp");
    byte[] bytes = obj.toString().getBytes(StandardCharsets.UTF_8);
    FileOutputStream out = new FileOutputStream(tmp);
    try {
      out.write(bytes);
      out.flush();
      out.getFD().sync();
    } finally {
      out.close();
    }
    if (!tmp.renameTo(file)) {
      FileOutputStream direct = new FileOutputStream(file);
      try {
        direct.write(bytes);
        direct.flush();
      } finally {
        direct.close();
      }
      //noinspection ResultOfMethodCallIgnored
      tmp.delete();
    }
  }

  static byte[] readAllBytes(File file) throws Exception {
    FileInputStream in = new FileInputStream(file);
    try {
      byte[] buf = new byte[(int) Math.max(0, file.length())];
      int off = 0;
      while (off < buf.length) {
        int n = in.read(buf, off, buf.length - off);
        if (n < 0) break;
        off += n;
      }
      if (off == buf.length) return buf;
      byte[] exact = new byte[off];
      System.arraycopy(buf, 0, exact, 0, off);
      return exact;
    } finally {
      in.close();
    }
  }

  private static void deleteRecursive(File f) {
    if (f == null || !f.exists()) return;
    File[] kids = f.listFiles();
    if (kids != null) {
      for (File k : kids) deleteRecursive(k);
    }
    //noinspection ResultOfMethodCallIgnored
    f.delete();
  }

  private static void copyDir(File src, File dst) throws Exception {
    if (src.isDirectory()) {
      if (!dst.mkdirs() && !dst.isDirectory()) {
        throw new IllegalStateException("copy_mkdir");
      }
      File[] kids = src.listFiles();
      if (kids != null) {
        for (File k : kids) {
          copyDir(k, new File(dst, k.getName()));
        }
      }
    } else {
      FileInputStream in = new FileInputStream(src);
      try {
        FileOutputStream out = new FileOutputStream(dst);
        try {
          byte[] buf = new byte[8192];
          int n;
          while ((n = in.read(buf)) >= 0) {
            out.write(buf, 0, n);
          }
        } finally {
          out.close();
        }
      } finally {
        in.close();
      }
    }
  }
}
