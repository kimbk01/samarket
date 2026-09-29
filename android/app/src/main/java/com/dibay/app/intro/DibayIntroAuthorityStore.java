package com.dibay.app.intro;

import android.content.Context;
import android.util.Base64;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * DIBAY INTRO — Android local Intro authority store (V2 Ready + V3 Active).
 * Base: context.getFilesDir()/intro/authority/v1/
 * Candidate → READY atomic promotion.
 * READY → ACTIVE is a pointer promotion only (does not mutate Pack bytes).
 */
public final class DibayIntroAuthorityStore {
  private static final String TAG = "DibayIntroAuth";
  private static final String ROOT = "intro/authority/v1";

  private static final String[] FONT_FILES = {
    "Pretendard-Regular.otf",
    "Pretendard-Medium.otf",
    "Pretendard-SemiBold.otf",
    "Pretendard-Bold.otf"
  };
  private static final String[] FONT_SHA256 = {
    "3ffbacde6ab8411f1d2db54bb9b1f0b3ee2a738932033722cf0388c06aed1c93",
    "d39e50e4bb52b4993b6a4eeb821a171254745bd824446af01e1f616b89fface0",
    "c89bc43027dc7cde5726e96223376f8eec09302b2fc1f8147fd5b57cfc376118",
    "2e91915fab54df71cc9598ebf608b2bdb54c6fe3c066ac61dff0bc44fca71cc7"
  };

  private final Context app;

  public DibayIntroAuthorityStore(Context context) {
    this.app = context.getApplicationContext();
  }

  public File baseDir() {
    return new File(app.getFilesDir(), ROOT);
  }

  private File candidateDir() {
    return new File(baseDir(), "candidate");
  }

  private File readyDir() {
    return new File(baseDir(), "ready");
  }

  private File activeDir() {
    return new File(baseDir(), "active");
  }

  private File fontsDir() {
    return new File(baseDir(), "fonts");
  }

  public JSONObject getAuthorityStatus() throws Exception {
    ensureFontsInstalled();
    JSONObject out = new JSONObject();
    out.put("baseDir", baseDir().getAbsolutePath());
    out.put("ready", readReadyIdentity());
    out.put("candidate", readCandidateIdentity());
    out.put("active", readActiveIdentity());
    File marker = new File(baseDir(), "no-live.json");
    if (marker.isFile()) {
      out.put("noLiveMarker", readUtf8(marker));
    } else {
      out.put("noLiveMarker", JSONObject.NULL);
    }
    FontCheck fonts = assertFonts();
    out.put("fontAuthorityOk", fonts.ok);
    JSONArray missing = new JSONArray();
    for (String m : fonts.missing) missing.put(m);
    out.put("fontMissing", missing);
    return out;
  }

  private JSONObject readReadyIdentity() throws Exception {
    JSONObject o = new JSONObject();
    File meta = new File(readyDir(), "meta.json");
    if (!meta.isFile()) {
      o.put("status", "NONE");
      return o;
    }
    JSONObject metaJson = new JSONObject(readUtf8(meta));
    o.put("status", "READY");
    o.put("publishedRevisionId", metaJson.optString("publishedRevisionId", ""));
    o.put("packId", metaJson.optString("packId", ""));
    o.put("packIntegrity", metaJson.optString("packIntegrity", ""));
    JSONArray ids = new JSONArray();
    JSONArray digests = new JSONArray();
    JSONArray assets = metaJson.optJSONArray("sealedAssets");
    if (assets != null) {
      for (int i = 0; i < assets.length(); i++) {
        JSONObject a = assets.getJSONObject(i);
        ids.put(a.optString("sealedAssetId", ""));
        digests.put(a.optString("sealedIntegrity", ""));
      }
    }
    o.put("sealedAssetIds", ids);
    o.put("sealedIntegrities", digests);
    o.put("activePointer", JSONObject.NULL);
    return o;
  }

  private JSONObject readActiveIdentity() throws Exception {
    JSONObject o = new JSONObject();
    File meta = new File(activeDir(), "meta.json");
    if (!meta.isFile()) {
      o.put("status", "NONE");
      return o;
    }
    JSONObject metaJson = new JSONObject(readUtf8(meta));
    o.put("status", "ACTIVE");
    o.put("publishedRevisionId", metaJson.optString("publishedRevisionId", ""));
    o.put("packId", metaJson.optString("packId", ""));
    o.put("packIntegrity", metaJson.optString("packIntegrity", ""));
    o.put("localPackPath", metaJson.optString("localPackPath", "ready/pack.json"));
    o.put(
        "localAssetsRoot",
        metaJson.optString("localAssetsRoot", "ready/assets"));
    o.put(
        "compatibilityVersion",
        metaJson.optString("compatibilityVersion", ""));
    o.put("activatedAt", metaJson.optString("activatedAt", ""));
    return o;
  }

  /**
   * Atomic Ready → Active pointer promotion. Does not copy or mutate Pack.
   * On failure previous Active remains authoritative.
   */
  public void promoteReadyToActive(String metaJson) throws Exception {
    File readyMeta = new File(readyDir(), "meta.json");
    File readyPack = new File(readyDir(), "pack.json");
    if (!readyMeta.isFile() || !readyPack.isFile()) {
      throw new IOException("NO_READY");
    }
    JSONObject incoming = new JSONObject(metaJson);
    JSONObject ready = new JSONObject(readUtf8(readyMeta));
    String pub = incoming.optString("publishedRevisionId", "");
    String packId = incoming.optString("packId", "");
    String packIntegrity = incoming.optString("packIntegrity", "");
    if (!pub.equals(ready.optString("publishedRevisionId", ""))
        || !packId.equals(ready.optString("packId", ""))
        || !packIntegrity.equals(ready.optString("packIntegrity", ""))) {
      throw new IOException("READY_ACTIVE_IDENTITY_MISMATCH");
    }
    incoming.put("status", "ACTIVE");
    if (!incoming.has("localPackPath")
        || incoming.optString("localPackPath", "").isEmpty()) {
      incoming.put("localPackPath", "ready/pack.json");
    }
    if (!incoming.has("localAssetsRoot")
        || incoming.optString("localAssetsRoot", "").isEmpty()) {
      incoming.put("localAssetsRoot", "ready/assets");
    }

    // packIntegrity is canonical-payload digest (excludes packIntegrity field),
    // NOT raw file SHA-256. V2 already verified canonical integrity at Ready.
    // Activation re-checks identity fields embedded in local Pack JSON.
    JSONObject packJson = new JSONObject(readUtf8(readyPack));
    if (!pub.equals(packJson.optString("publishedRevisionId", ""))
        || !packId.equals(packJson.optString("packId", ""))
        || !packIntegrity.equals(packJson.optString("packIntegrity", ""))) {
      throw new IOException("READY_PACK_EMBEDDED_IDENTITY_MISMATCH");
    }

    File active = activeDir();
    if (!active.exists() && !active.mkdirs()) {
      throw new IOException("active_mkdir_failed");
    }
    // Atomic meta write only — Pack stays in Ready storage.
    writeUtf8Atomic(new File(active, "meta.json"), incoming.toString());
    Log.i(
        TAG,
        "active_promoted packId="
            + packId
            + " revision="
            + pub);
  }

  /** Resolve Active pack file from pointer. Returns null when no Active. */
  public File resolveActivePackFile() throws Exception {
    JSONObject active = readActiveIdentity();
    if (!"ACTIVE".equals(active.optString("status", "NONE"))) return null;
    String rel = active.optString("localPackPath", "ready/pack.json");
    if (rel.contains("..")) throw new IOException("invalid_active_pack_path");
    File pack = new File(baseDir(), rel);
    if (!pack.isFile()) return null;
    return pack;
  }

  public File resolveActiveAssetsRoot() throws Exception {
    JSONObject active = readActiveIdentity();
    if (!"ACTIVE".equals(active.optString("status", "NONE"))) return null;
    String rel = active.optString("localAssetsRoot", "ready/assets");
    if (rel.contains("..")) throw new IOException("invalid_active_assets_path");
    return new File(baseDir(), rel);
  }

  public JSONObject readActiveMetaOrNull() throws Exception {
    JSONObject active = readActiveIdentity();
    if (!"ACTIVE".equals(active.optString("status", "NONE"))) return null;
    File meta = new File(activeDir(), "meta.json");
    if (!meta.isFile()) return null;
    return new JSONObject(readUtf8(meta));
  }

  public JSONObject readReadyMetaOrNull() throws Exception {
    File meta = new File(readyDir(), "meta.json");
    if (!meta.isFile()) return null;
    return new JSONObject(readUtf8(meta));
  }

  /**
   * Product-driven activation when Ready exists and Active is missing/stale.
   * Used on cold start so offline true-cold can consume Active without network.
   */
  public boolean ensureActiveFromReadyIfNeeded() throws Exception {
    JSONObject ready = readReadyMetaOrNull();
    if (ready == null) return false;
    JSONObject active = readActiveMetaOrNull();
    if (active != null
        && ready.optString("publishedRevisionId", "")
            .equals(active.optString("publishedRevisionId", ""))
        && ready
            .optString("packId", "")
            .equals(active.optString("packId", ""))
        && ready
            .optString("packIntegrity", "")
            .equals(active.optString("packIntegrity", ""))) {
      return true;
    }
    JSONObject meta = new JSONObject();
    meta.put("status", "ACTIVE");
    meta.put("publishedRevisionId", ready.optString("publishedRevisionId", ""));
    meta.put("packId", ready.optString("packId", ""));
    meta.put("packIntegrity", ready.optString("packIntegrity", ""));
    meta.put("localPackPath", "ready/pack.json");
    meta.put("localAssetsRoot", "ready/assets");
    meta.put("compatibilityVersion", "intro-pack-v1/r1");
    meta.put("activatedAt", java.time.Instant.now().toString());
    JSONArray verified = new JSONArray();
    JSONArray sealed = ready.optJSONArray("sealedAssets");
    if (sealed != null) {
      for (int i = 0; i < sealed.length(); i++) {
        JSONObject a = sealed.getJSONObject(i);
        JSONObject v = new JSONObject();
        v.put("sealedAssetId", a.optString("sealedAssetId", ""));
        v.put("sealedIntegrity", a.optString("sealedIntegrity", ""));
        v.put("relativePackPath", a.optString("relativePackPath", ""));
        verified.put(v);
      }
    }
    meta.put("verifiedAssetAuthority", verified);
    promoteReadyToActive(meta.toString());
    return true;
  }

  private JSONObject readCandidateIdentity() throws Exception {
    JSONObject o = new JSONObject();
    File meta = new File(candidateDir(), "meta.json");
    if (!meta.isFile()) {
      o.put("status", "NONE");
      return o;
    }
    JSONObject metaJson = new JSONObject(readUtf8(meta));
    o.put("status", metaJson.optString("status", "CANDIDATE"));
    o.put("publishedRevisionId", metaJson.optString("publishedRevisionId", ""));
    o.put("packId", metaJson.optString("packId", ""));
    o.put("packIntegrity", metaJson.optString("packIntegrity", ""));
    if (metaJson.has("failureCode")) {
      o.put("failureCode", metaJson.optString("failureCode", ""));
    }
    return o;
  }

  public void beginCandidate(String metaJson) throws Exception {
    File dir = candidateDir();
    deleteRecursive(dir);
    if (!dir.mkdirs()) throw new IOException("candidate_mkdir_failed");
    File assets = new File(dir, "assets");
    if (!assets.mkdirs()) throw new IOException("candidate_assets_mkdir_failed");
    writeUtf8Atomic(new File(dir, "meta.json"), metaJson);
  }

  public void writeCandidatePack(String base64) throws Exception {
    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
    writeBytesAtomic(new File(candidateDir(), "pack.json"), bytes);
  }

  public void writeCandidateAsset(String relativePackPath, String base64)
      throws Exception {
    if (relativePackPath == null
        || relativePackPath.contains("..")
        || !relativePackPath.startsWith("assets/")) {
      throw new IOException("invalid_relative_pack_path");
    }
    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
    File dest = new File(candidateDir(), relativePackPath);
    File parent = dest.getParentFile();
    if (parent != null && !parent.exists() && !parent.mkdirs()) {
      throw new IOException("asset_parent_mkdir_failed");
    }
    writeBytesAtomic(dest, bytes);
  }

  public void markCandidateFailed(String metaJson, String failureCode)
      throws Exception {
    JSONObject meta = new JSONObject(metaJson);
    meta.put("status", "FAILED");
    meta.put("failureCode", failureCode);
    writeUtf8Atomic(new File(candidateDir(), "meta.json"), meta.toString());
  }

  public void promoteCandidateToReady(String metaJson) throws Exception {
    File cand = candidateDir();
    File ready = readyDir();
    File tmp = new File(baseDir(), "ready.tmp." + System.currentTimeMillis());
    if (tmp.exists()) deleteRecursive(tmp);
    if (!tmp.mkdirs()) throw new IOException("ready_tmp_mkdir_failed");

    // Copy candidate pack + assets into tmp, then write meta, then atomic swap.
    copyFile(new File(cand, "pack.json"), new File(tmp, "pack.json"));
    File candAssets = new File(cand, "assets");
    File tmpAssets = new File(tmp, "assets");
    if (!tmpAssets.mkdirs()) throw new IOException("ready_assets_mkdir_failed");
    if (candAssets.isDirectory()) {
      File[] files = candAssets.listFiles();
      if (files != null) {
        for (File f : files) {
          copyFile(f, new File(tmpAssets, f.getName()));
        }
      }
    }
    JSONObject meta = new JSONObject(metaJson);
    meta.put("status", "READY");
    meta.put("activePointer", JSONObject.NULL);
    writeUtf8Atomic(new File(tmp, "meta.json"), meta.toString());

    File backup = new File(baseDir(), "ready.bak." + System.currentTimeMillis());
    if (ready.exists()) {
      if (!ready.renameTo(backup)) {
        throw new IOException("ready_backup_rename_failed");
      }
    }
    if (!tmp.renameTo(ready)) {
      // try restore
      if (backup.exists()) backup.renameTo(ready);
      throw new IOException("ready_promote_rename_failed");
    }
    if (backup.exists()) deleteRecursive(backup);
    deleteRecursive(cand);
  }

  public FontCheck assertFonts() throws Exception {
    ensureFontsInstalled();
    List<String> missing = new ArrayList<>();
    for (int i = 0; i < FONT_FILES.length; i++) {
      File f = new File(fontsDir(), FONT_FILES[i]);
      if (!f.isFile()) {
        missing.add(FONT_FILES[i]);
        continue;
      }
      String hex = sha256Hex(readAllBytes(f));
      if (!FONT_SHA256[i].equalsIgnoreCase(hex)) {
        missing.add(FONT_FILES[i] + ":HASH_MISMATCH");
      }
    }
    FontCheck check = new FontCheck();
    check.ok = missing.isEmpty();
    check.missing = missing;
    return check;
  }

  public void recordNoLiveMarker(String physicalLiveKind) throws Exception {
    JSONObject o = new JSONObject();
    o.put("physicalLiveKind", physicalLiveKind);
    o.put("recordedAt", System.currentTimeMillis());
    if (!baseDir().exists() && !baseDir().mkdirs()) {
      throw new IOException("base_mkdir_failed");
    }
    writeUtf8Atomic(new File(baseDir(), "no-live.json"), o.toString());
  }

  public void clearNoLiveMarker() {
    File marker = new File(baseDir(), "no-live.json");
    if (marker.exists()) {
      //noinspection ResultOfMethodCallIgnored
      marker.delete();
    }
  }

  private void ensureFontsInstalled() throws Exception {
    File dir = fontsDir();
    if (!dir.exists() && !dir.mkdirs()) {
      throw new IOException("fonts_mkdir_failed");
    }
    for (String name : FONT_FILES) {
      File dest = new File(dir, name);
      if (dest.isFile() && dest.length() > 0) continue;
      try (InputStream in = app.getAssets().open("intro/fonts/" + name)) {
        writeBytesAtomic(dest, readAll(in));
      } catch (IOException e) {
        Log.w(TAG, "font_asset_missing:" + name, e);
      }
    }
  }

  private static void writeUtf8Atomic(File dest, String utf8) throws IOException {
    writeBytesAtomic(dest, utf8.getBytes(StandardCharsets.UTF_8));
  }

  private static void writeBytesAtomic(File dest, byte[] bytes) throws IOException {
    File parent = dest.getParentFile();
    if (parent != null && !parent.exists() && !parent.mkdirs()) {
      throw new IOException("parent_mkdir_failed");
    }
    File tmp = new File(dest.getAbsolutePath() + ".tmp");
    try (FileOutputStream out = new FileOutputStream(tmp)) {
      out.write(bytes);
      out.getFD().sync();
    }
    if (dest.exists() && !dest.delete()) {
      throw new IOException("dest_delete_failed");
    }
    if (!tmp.renameTo(dest)) {
      throw new IOException("atomic_rename_failed");
    }
  }

  private static void copyFile(File src, File dest) throws IOException {
    writeBytesAtomic(dest, readAllBytes(src));
  }

  private static String readUtf8(File f) throws IOException {
    return new String(readAllBytes(f), StandardCharsets.UTF_8);
  }

  private static byte[] readAllBytes(File f) throws IOException {
    try (FileInputStream in = new FileInputStream(f)) {
      return readAll(in);
    }
  }

  private static byte[] readAll(InputStream in) throws IOException {
    ByteArrayOutputStream bos = new ByteArrayOutputStream();
    byte[] buf = new byte[8192];
    int n;
    while ((n = in.read(buf)) >= 0) {
      bos.write(buf, 0, n);
    }
    return bos.toByteArray();
  }

  private static String sha256Hex(byte[] bytes) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    byte[] dig = md.digest(bytes);
    StringBuilder sb = new StringBuilder(dig.length * 2);
    for (byte b : dig) {
      sb.append(String.format("%02x", b));
    }
    return sb.toString();
  }

  private static void deleteRecursive(File f) {
    if (f == null || !f.exists()) return;
    if (f.isDirectory()) {
      File[] children = f.listFiles();
      if (children != null) {
        for (File c : children) deleteRecursive(c);
      }
    }
    //noinspection ResultOfMethodCallIgnored
    f.delete();
  }

  public static final class FontCheck {
    public boolean ok;
    public List<String> missing = new ArrayList<>();
  }
}
