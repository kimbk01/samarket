package com.dibay.app;

import android.content.Context;
import android.util.Log;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * R14-P7 — local verified StartupPackageEnvelope authority.
 * Cold compositor reads verified/startup-envelope.json only (not pack.json).
 */
public final class DibayStartupEnvelopeVerifiedStore {
  public static final String TAG = "DibayStartupEnvStore";
  public static final String ENVELOPE_FILE = "startup-envelope.json";

  private final File base;

  public DibayStartupEnvelopeVerifiedStore(Context context) {
    this.base = new File(context.getFilesDir(), "dibay-startup-envelope");
  }

  public File verifiedDir() {
    return new File(base, "verified");
  }

  public File envelopeFile() {
    return new File(verifiedDir(), ENVELOPE_FILE);
  }

  public File metaFile() {
    return new File(verifiedDir(), "meta.json");
  }

  public File mediaDir() {
    return new File(verifiedDir(), "media");
  }

  public File stagingDir() {
    return new File(base, "staging");
  }

  public JSONObject readEnvelopeOrNull() {
    try {
      File f = envelopeFile();
      if (!f.isFile()) return null;
      JSONObject meta = readMetaOrNull();
      if (meta == null) return null;
      String raw = new String(readAllBytes(f), StandardCharsets.UTF_8);
      JSONObject env = new JSONObject(raw);
      if (env.optInt("schemaVersion", -1) != 14) return null;
      if (!"OWNER".equalsIgnoreCase(env.optString("contentClass", ""))) {
        Log.w(TAG, "reject_non_owner_envelope class=" + env.optString("contentClass", ""));
        return null;
      }
      String integrity = env.optString("integrity", "");
      String expected = meta.optString("envelopeIntegrity", "");
      if (integrity.isEmpty() || !integrity.equalsIgnoreCase(expected)) {
        return null;
      }
      if (!mediaFilesPresent(env)) return null;
      return env;
    } catch (Exception e) {
      Log.w(TAG, "read_envelope_failed", e);
      return null;
    }
  }

  public JSONObject readMetaOrNull() {
    try {
      File f = metaFile();
      if (!f.isFile()) return null;
      return new JSONObject(new String(readAllBytes(f), StandardCharsets.UTF_8));
    } catch (Exception e) {
      return null;
    }
  }

  public File mediaFile(String mediaId) {
    return new File(mediaDir(), mediaId);
  }

  public boolean hasVerifiedMatching(String generationId, String envelopeIntegrity) {
    try {
      JSONObject meta = readMetaOrNull();
      if (meta == null) return false;
      if (!generationId.equals(meta.optString("generationId", ""))) return false;
      if (!envelopeIntegrity.equalsIgnoreCase(meta.optString("envelopeIntegrity", ""))) {
        return false;
      }
      return readEnvelopeOrNull() != null;
    } catch (Exception e) {
      return false;
    }
  }

  public void atomicCommit(
      byte[] envelopeBytes,
      Map<String, byte[]> mediaById,
      String generationId,
      String envelopeIntegrity,
      String packageId,
      String releaseId)
      throws Exception {
    File staging = stagingDir();
    deleteRecursive(staging);
    if (!staging.mkdirs()) throw new IllegalStateException("staging_mkdir_failed");
    File stagingEnv = new File(staging, ENVELOPE_FILE);
    writeBytes(stagingEnv, envelopeBytes);
    File stagingMedia = new File(staging, "media");
    if (!stagingMedia.mkdirs()) throw new IllegalStateException("staging_media_mkdir_failed");
    if (mediaById != null) {
      for (Map.Entry<String, byte[]> e : mediaById.entrySet()) {
        writeBytes(new File(stagingMedia, e.getKey()), e.getValue());
      }
    }
    JSONObject meta = new JSONObject();
    meta.put("generationId", generationId);
    meta.put("envelopeIntegrity", envelopeIntegrity);
    meta.put("packageId", packageId);
    meta.put("releaseId", releaseId);
    meta.put("schemaVersion", 14);
    writeBytes(new File(staging, "meta.json"), meta.toString().getBytes(StandardCharsets.UTF_8));

    File verified = verifiedDir();
    File verifiedBak = new File(base, "verified.bak");
    deleteRecursive(verifiedBak);
    if (verified.exists() && !verified.renameTo(verifiedBak)) {
      throw new IllegalStateException("verified_backup_failed");
    }
    if (!staging.renameTo(verified)) {
      if (verifiedBak.exists()) verifiedBak.renameTo(verified);
      throw new IllegalStateException("verified_promote_failed");
    }
    deleteRecursive(verifiedBak);
    Log.i(TAG, "atomic_commit ok generationId=" + generationId);
  }

  private boolean mediaFilesPresent(JSONObject env) {
    JSONArray manifest = env.optJSONArray("mediaManifest");
    if (manifest == null) return true;
    for (int i = 0; i < manifest.length(); i++) {
      JSONObject entry = manifest.optJSONObject(i);
      if (entry == null) return false;
      String mediaId = entry.optString("mediaId", "");
      if (mediaId.isEmpty()) return false;
      if (!mediaFile(mediaId).isFile()) return false;
    }
    return true;
  }

  private static void writeBytes(File f, byte[] bytes) throws Exception {
    File parent = f.getParentFile();
    if (parent != null && !parent.exists() && !parent.mkdirs()) {
      throw new IllegalStateException("mkdir_failed:" + parent);
    }
    FileOutputStream out = new FileOutputStream(f);
    try {
      out.write(bytes);
      out.flush();
    } finally {
      out.close();
    }
  }

  private static byte[] readAllBytes(File f) throws Exception {
    FileInputStream in = new FileInputStream(f);
    try {
      byte[] buf = new byte[(int) f.length()];
      int off = 0;
      while (off < buf.length) {
        int n = in.read(buf, off, buf.length - off);
        if (n < 0) break;
        off += n;
      }
      return buf;
    } finally {
      in.close();
    }
  }

  private static void deleteRecursive(File f) {
    if (f == null || !f.exists()) return;
    if (f.isDirectory()) {
      File[] kids = f.listFiles();
      if (kids != null) {
        for (File k : kids) deleteRecursive(k);
      }
    }
    //noinspection ResultOfMethodCallIgnored
    f.delete();
  }

  public static String sha256Hex(byte[] bytes) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    byte[] dig = md.digest(bytes);
    StringBuilder sb = new StringBuilder(dig.length * 2);
    for (byte b : dig) sb.append(String.format("%02x", b));
    return sb.toString();
  }
}
