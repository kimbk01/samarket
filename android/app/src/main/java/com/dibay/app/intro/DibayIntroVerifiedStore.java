package com.dibay.app.intro;

import android.content.Context;
import android.util.Log;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * 13th local authority — ONE verified package only.
 * No Candidate / Ready / Active split. Cold renderer reads verified/ only.
 */
public final class DibayIntroVerifiedStore {
  public static final String TAG = "DibayIntroStore";

  private final File base;

  public DibayIntroVerifiedStore(Context context) {
    this.base = new File(context.getFilesDir(), "dibay-intro-13");
  }

  public File baseDir() {
    return base;
  }

  public File verifiedDir() {
    return new File(base, "verified");
  }

  public File verifiedPackFile() {
    return new File(verifiedDir(), "pack.json");
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

  /** Read verified meta or null. */
  public JSONObject readVerifiedMetaOrNull() throws Exception {
    File meta = verifiedMetaFile();
    if (!meta.isFile()) return null;
    String raw = new String(readAllBytes(meta), StandardCharsets.UTF_8);
    return new JSONObject(raw);
  }

  public boolean hasVerifiedMatching(String packageId, String packageIntegrity) throws Exception {
    JSONObject meta = readVerifiedMetaOrNull();
    if (meta == null) return false;
    if (!packageId.equals(meta.optString("packageId", ""))) return false;
    if (!packageIntegrity.equals(meta.optString("packageIntegrity", ""))) return false;
    File pack = verifiedPackFile();
    if (!pack.isFile()) return false;
    DibayIntroPackModel.ParseResult parsed =
        DibayIntroPackModel.parseAndVerify(pack, packageIntegrity);
    return parsed.ok;
  }

  public void writeLivePointer(JSONObject live) throws Exception {
    ensureDir(base);
    atomicWriteJson(livePointerFile(), live);
  }

  public JSONObject readLivePointerOrNull() throws Exception {
    File f = livePointerFile();
    if (!f.isFile()) return null;
    String raw = new String(readAllBytes(f), StandardCharsets.UTF_8);
    return new JSONObject(raw);
  }

  /**
   * Atomic commit of a complete verified package.
   * Staging → verify → rename verified.tmp → verified.
   * On failure previous verified remains, or none.
   */
  public void atomicCommitVerified(
      byte[] packBytes, String releaseId, String packageId, String packageIntegrity)
      throws Exception {
    File staging = stagingDir();
    deleteRecursive(staging);
    if (!staging.mkdirs()) {
      throw new IllegalStateException("staging_mkdir_failed");
    }
    File stagingPack = new File(staging, "pack.json");
    try (FileOutputStream out = new FileOutputStream(stagingPack)) {
      out.write(packBytes);
      out.flush();
    }
    DibayIntroPackModel.ParseResult parsed =
        DibayIntroPackModel.parseAndVerify(stagingPack, packageIntegrity);
    if (!parsed.ok || parsed.model == null) {
      deleteRecursive(staging);
      throw new IllegalStateException(
          "verify_failed:" + (parsed.failureCode != null ? parsed.failureCode : "unknown"));
    }
    if (!packageId.equals(parsed.model.packageId)) {
      deleteRecursive(staging);
      throw new IllegalStateException("package_id_mismatch");
    }

    JSONObject meta = new JSONObject();
    meta.put("releaseId", releaseId);
    meta.put("packageId", packageId);
    meta.put("packageIntegrity", packageIntegrity);
    meta.put("committedAt", System.currentTimeMillis());
    File stagingMeta = new File(staging, "meta.json");
    atomicWriteJson(stagingMeta, meta);

    File verifiedTmp = new File(base, "verified.tmp");
    deleteRecursive(verifiedTmp);
    if (!staging.renameTo(verifiedTmp)) {
      // Fallback copy
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
      // Restore old
      if (verifiedOld.exists()) {
        verifiedOld.renameTo(verified);
      }
      throw new IllegalStateException("atomic_rename_failed");
    }
    deleteRecursive(verifiedOld);
    Log.i(TAG, "atomic_commit ok packageId=" + packageId);
  }

  public void quarantineVerified(String reason) {
    try {
      File q = new File(base, "quarantine-" + System.currentTimeMillis());
      File verified = verifiedDir();
      if (verified.exists()) {
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

  private static byte[] readAllBytes(File file) throws Exception {
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
