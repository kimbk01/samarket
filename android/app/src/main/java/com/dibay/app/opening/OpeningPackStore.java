package com.dibay.app.opening;

import android.content.Context;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

final class OpeningPackStore {
  private static final String TAG = "OpeningPack";
  private static final String ROOT = "opening-pack";
  private static final String CURRENT = "current";
  private static final String STAGING = "staging";
  private static final String READY = "READY";
  private static final String MANIFEST = "manifest.json";

  private OpeningPackStore() {}

  static File currentDir(Context context) {
    return new File(new File(context.getFilesDir(), ROOT), CURRENT);
  }

  static boolean isReady(Context context) {
    File dir = currentDir(context);
    if (!new File(dir, READY).isFile()) return false;
    File manifestFile = new File(dir, MANIFEST);
    if (!manifestFile.isFile()) return false;
    try {
      JSONObject manifest = new JSONObject(readUtf8(manifestFile));
      return verifyManifestFiles(dir, manifest);
    } catch (Exception e) {
      Log.w(TAG, "ready_check_failed " + e.getMessage());
      return false;
    }
  }

  static JSONObject readManifest(Context context) throws Exception {
    return new JSONObject(readUtf8(new File(currentDir(context), MANIFEST)));
  }

  static File mediaFile(Context context, String mediaId) {
    return new File(new File(currentDir(context), "media"), mediaId + ".webp");
  }

  static boolean install(Context context, JSONObject manifest) {
    File root = new File(context.getFilesDir(), ROOT);
    File staging = new File(root, STAGING);
    File current = new File(root, CURRENT);
    deleteRecursively(staging);
    if (!staging.mkdirs()) return false;
    File mediaDir = new File(staging, "media");
    if (!mediaDir.mkdirs()) return false;
    try {
      JSONArray assets = manifest.getJSONArray("assets");
      for (int i = 0; i < assets.length(); i++) {
        JSONObject asset = assets.getJSONObject(i);
        String mediaId = asset.getString("mediaId");
        String url = asset.getString("url");
        String sha = asset.getString("sha256");
        int bytes = asset.getInt("bytes");
        File dest = new File(mediaDir, mediaId + ".webp");
        byte[] body = download(url);
        if (body == null || body.length != bytes) return false;
        if (!sha256Hex(body).equalsIgnoreCase(sha)) return false;
        writeBytes(dest, body);
      }
      writeUtf8(new File(staging, MANIFEST), manifest.toString());
      if (!verifyManifestFiles(staging, manifest)) return false;
      writeUtf8(new File(staging, READY), "1");
      File bak = new File(root, "current.bak");
      deleteRecursively(bak);
      if (current.exists() && !current.renameTo(bak)) {
        deleteRecursively(current);
      }
      if (!staging.renameTo(current)) return false;
      deleteRecursively(bak);
      return true;
    } catch (Exception e) {
      Log.w(TAG, "install_failed " + e.getMessage());
      deleteRecursively(staging);
      return false;
    }
  }

  static boolean verifyManifestFiles(File dir, JSONObject manifest) throws Exception {
    String revisionId = manifest.getString("revisionId");
    String checksum = manifest.getString("checksum");
    JSONArray assets = manifest.getJSONArray("assets");
    List<String> hashes = new ArrayList<>();
    File mediaDir = new File(dir, "media");
    for (int i = 0; i < assets.length(); i++) {
      JSONObject asset = assets.getJSONObject(i);
      String mediaId = asset.getString("mediaId");
      String sha = asset.getString("sha256");
      int bytes = asset.getInt("bytes");
      File file = new File(mediaDir, mediaId + ".webp");
      if (!file.isFile() || file.length() != bytes) return false;
      String actual = sha256Hex(readBytes(file));
      if (!actual.equalsIgnoreCase(sha)) return false;
      hashes.add(sha.toLowerCase());
    }
    Collections.sort(hashes);
    StringBuilder joined = new StringBuilder(revisionId).append(':');
    for (int i = 0; i < hashes.size(); i++) {
      if (i > 0) joined.append(',');
      joined.append(hashes.get(i));
    }
    String computed = sha256Hex(joined.toString().getBytes(StandardCharsets.UTF_8));
    return computed.equalsIgnoreCase(checksum);
  }

  private static byte[] download(String urlSpec) throws Exception {
    HttpURLConnection conn = (HttpURLConnection) new URL(urlSpec).openConnection();
    conn.setConnectTimeout(15_000);
    conn.setReadTimeout(30_000);
    conn.setInstanceFollowRedirects(true);
    try (InputStream in = conn.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buf = new byte[8192];
      int n;
      while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
      return out.toByteArray();
    } finally {
      conn.disconnect();
    }
  }

  static String sha256Hex(byte[] bytes) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
    StringBuilder hex = new StringBuilder(digest.length * 2);
    for (byte b : digest) hex.append(String.format("%02x", b));
    return hex.toString();
  }

  private static String readUtf8(File file) throws Exception {
    return new String(readBytes(file), StandardCharsets.UTF_8);
  }

  private static byte[] readBytes(File file) throws Exception {
    try (FileInputStream in = new FileInputStream(file);
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buf = new byte[8192];
      int n;
      while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
      return out.toByteArray();
    }
  }

  private static void writeUtf8(File file, String text) throws Exception {
    writeBytes(file, text.getBytes(StandardCharsets.UTF_8));
  }

  private static void writeBytes(File file, byte[] bytes) throws Exception {
    try (FileOutputStream out = new FileOutputStream(file)) {
      out.write(bytes);
    }
  }

  private static void deleteRecursively(File file) {
    if (file == null || !file.exists()) return;
    File[] children = file.listFiles();
    if (children != null) {
      for (File child : children) deleteRecursively(child);
    }
    //noinspection ResultOfMethodCallIgnored
    file.delete();
  }
}
