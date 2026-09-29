package com.dibay.app.intro;

import android.graphics.Color;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Parses IntroRuntimePackageV1 (13th) — scenes[].elements[] with payload.
 * Integrity = SHA-256 of canonical JSON without packageIntegrity field.
 */
public final class DibayIntroPackModel {
  public final String packageId;
  public final String releaseId;
  public final String packageIntegrity;
  public final float compositionW;
  public final float compositionH;
  public final List<Scene> scenes;
  public final Map<String, Asset> assetsByMediaId;

  public DibayIntroPackModel(
      String packageId,
      String releaseId,
      String packageIntegrity,
      float compositionW,
      float compositionH,
      List<Scene> scenes,
      Map<String, Asset> assetsByMediaId) {
    this.packageId = packageId;
    this.releaseId = releaseId;
    this.packageIntegrity = packageIntegrity;
    this.compositionW = compositionW;
    this.compositionH = compositionH;
    this.scenes = scenes;
    this.assetsByMediaId = assetsByMediaId;
  }

  public static final class Frame {
    public final float x, y, w, h;

    public Frame(float x, float y, float w, float h) {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
    }
  }

  public static final class Element {
    public final String id;
    public final String type;
    public final Frame frame;
    public final int zIndex;
    public final boolean visible;
    public final float opacity;
    public final String text;
    public final int textColorArgb;
    public final float fontSizeNorm;
    public final String align;
    public final String weight;
    public final String mediaId;
    public final String fit;

    public Element(
        String id,
        String type,
        Frame frame,
        int zIndex,
        boolean visible,
        float opacity,
        String text,
        int textColorArgb,
        float fontSizeNorm,
        String align,
        String weight,
        String mediaId,
        String fit) {
      this.id = id;
      this.type = type;
      this.frame = frame;
      this.zIndex = zIndex;
      this.visible = visible;
      this.opacity = opacity;
      this.text = text;
      this.textColorArgb = textColorArgb;
      this.fontSizeNorm = fontSizeNorm;
      this.align = align;
      this.weight = weight;
      this.mediaId = mediaId;
      this.fit = fit;
    }
  }

  public static final class Asset {
    public final String mediaId;
    public final String relativePath;
    public final String integrity;
    public final int width;
    public final int height;
    public final String format;

    public Asset(
        String mediaId,
        String relativePath,
        String integrity,
        int width,
        int height,
        String format) {
      this.mediaId = mediaId;
      this.relativePath = relativePath;
      this.integrity = integrity;
      this.width = width;
      this.height = height;
      this.format = format;
    }
  }

  public static final class Scene {
    public final String id;
    public final int durationMs;
    public final int backgroundArgb;
    public final String transitionType;
    public final int transitionDurationMs;
    public final List<Element> elements;

    public Scene(
        String id,
        int durationMs,
        int backgroundArgb,
        String transitionType,
        int transitionDurationMs,
        List<Element> elements) {
      this.id = id;
      this.durationMs = durationMs;
      this.backgroundArgb = backgroundArgb;
      this.transitionType = transitionType;
      this.transitionDurationMs = transitionDurationMs;
      this.elements = elements;
    }
  }

  public static final class ParseResult {
    public final boolean ok;
    public final String failureCode;
    public final DibayIntroPackModel model;

    public ParseResult(boolean ok, String failureCode, DibayIntroPackModel model) {
      this.ok = ok;
      this.failureCode = failureCode;
      this.model = model;
    }
  }

  public static ParseResult parseAndVerify(File packFile, String expectedIntegrity)
      throws Exception {
    byte[] bytes = readAllBytes(packFile);
    JSONObject root = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
    String embedded = root.optString("packageIntegrity", "");
    if (expectedIntegrity != null
        && !expectedIntegrity.isEmpty()
        && !expectedIntegrity.equals(embedded)) {
      return new ParseResult(false, "PACK_INTEGRITY_MISMATCH", null);
    }
    // Mutate a shallow copy — do NOT re-serialize via root.toString() (float drift).
    JSONObject forHash = new JSONObject();
    Iterator<String> keys = root.keys();
    while (keys.hasNext()) {
      String k = keys.next();
      if ("packageIntegrity".equals(k)) continue;
      forHash.put(k, root.get(k));
    }
    String computed = sha256Hex(canonicalize(forHash).getBytes(StandardCharsets.UTF_8));
    if (!computed.equals(embedded)) {
      try {
        String canon = canonicalize(forHash);
        android.util.Log.e(
            "DibayIntroPack",
            "integrity_mismatch computed="
                + computed
                + " embedded="
                + embedded
                + " canonLen="
                + canon.length()
                + " canonHead="
                + canon.substring(0, Math.min(240, canon.length())));
      } catch (Exception logErr) {
        android.util.Log.e("DibayIntroPack", "integrity_mismatch_log_failed", logErr);
      }
      return new ParseResult(false, "PACK_INTEGRITY_COMPUTE_MISMATCH", null);
    }
    return parseRoot(root, embedded);
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

  public static ParseResult parseRoot(JSONObject root, String packageIntegrity) throws Exception {
    String packageId = root.optString("packageId", "");
    String releaseId = root.optString("releaseId", "");
    if (packageId.isEmpty() || releaseId.isEmpty()) {
      return new ParseResult(false, "PACK_MISSING_IDS", null);
    }
    JSONObject aspect = root.optJSONObject("compositionAspect");
    float CaW = 9f;
    float CaH = 16f;
    if (aspect != null) {
      CaW = (float) aspect.optDouble("w", 9);
      CaH = (float) aspect.optDouble("h", 16);
    }
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
                a.optString("integrity", ""),
                a.optInt("width", 0),
                a.optInt("height", 0),
                a.optString("format", "")));
      }
    }
    JSONArray sceneArr = root.optJSONArray("scenes");
    if (sceneArr == null || sceneArr.length() == 0) {
      return new ParseResult(false, "PACK_NO_SCENES", null);
    }
    List<Scene> scenes = new ArrayList<>();
    for (int i = 0; i < sceneArr.length(); i++) {
      ParseResult sp = parseScene(sceneArr.getJSONObject(i));
      if (!sp.ok) return sp;
      scenes.add(sp.model.scenes.get(0));
    }
    return new ParseResult(
        true,
        null,
        new DibayIntroPackModel(
            packageId,
            releaseId,
            packageIntegrity,
            CaW,
            CaH,
            Collections.unmodifiableList(scenes),
            Collections.unmodifiableMap(assets)));
  }

  private static ParseResult parseScene(JSONObject s) throws Exception {
    String id = s.optString("id", "");
    int durationMs = s.optInt("durationMs", 0);
    if (durationMs < 100) {
      return new ParseResult(false, "SCENE_DURATION", null);
    }
    JSONObject bg = s.optJSONObject("background");
    int bgArgb = Color.BLACK;
    if (bg != null) {
      String bgType = bg.optString("type", "");
      if ("COLOR".equals(bgType)) {
        bgArgb = parseColorHex(bg.optString("color", "#000000"), Color.BLACK);
      } else if ("IMAGE".equals(bgType)) {
        return new ParseResult(false, "BACKGROUND_IMAGE_NOT_YET", null);
      } else {
        return new ParseResult(false, "UNSUPPORTED_BACKGROUND:" + bgType, null);
      }
    }
    JSONObject tr = s.optJSONObject("transition");
    String trType = "CUT";
    int trMs = 0;
    if (tr != null) {
      trType = tr.optString("type", "CUT");
      trMs = tr.optInt("durationMs", 0);
      if (!"CUT".equals(trType) && !"FADE".equals(trType) && !"SLIDE".equals(trType)) {
        return new ParseResult(false, "UNSUPPORTED_TRANSITION:" + trType, null);
      }
    }
    List<Element> elements = new ArrayList<>();
    JSONArray elArr = s.optJSONArray("elements");
    if (elArr != null) {
      for (int i = 0; i < elArr.length(); i++) {
        ParseResult er = parseElement(elArr.getJSONObject(i));
        if (!er.ok) return er;
        elements.add(er.model.scenes.get(0).elements.get(0));
      }
    }
    elements.sort(Comparator.comparingInt(e -> e.zIndex));
    Scene scene =
        new Scene(
            id,
            durationMs,
            bgArgb,
            trType,
            trMs,
            Collections.unmodifiableList(elements));
    DibayIntroPackModel stub =
        new DibayIntroPackModel(
            "",
            "",
            "",
            9,
            16,
            Collections.singletonList(scene),
            Collections.emptyMap());
    return new ParseResult(true, null, stub);
  }

  private static ParseResult parseElement(JSONObject el) throws Exception {
    String type = el.optString("type", "");
    if ("CTA".equals(type)) {
      return new ParseResult(false, "ELEMENT_NOT_YET:CTA", null);
    }
    if (!"TEXT".equals(type) && !"IMAGE".equals(type) && !"LOGO".equals(type)) {
      return new ParseResult(false, "UNSUPPORTED_ELEMENT:" + type, null);
    }
    JSONObject frameJson = el.optJSONObject("frame");
    if (frameJson == null) {
      return new ParseResult(false, "ELEMENT_MISSING_FRAME", null);
    }
    Frame frame =
        new Frame(
            (float) frameJson.optDouble("x", 0),
            (float) frameJson.optDouble("y", 0),
            (float) frameJson.optDouble("w", 0),
            (float) frameJson.optDouble("h", 0));
    JSONObject payload = el.optJSONObject("payload");
    if (payload == null) {
      return new ParseResult(false, "MISSING_PAYLOAD", null);
    }
    Element element;
    if ("TEXT".equals(type)) {
      String text = payload.optString("text", "");
      if (text.trim().isEmpty()) {
        return new ParseResult(false, "EMPTY_TEXT", null);
      }
      element =
          new Element(
              el.optString("id", ""),
              type,
              frame,
              el.optInt("zIndex", 0),
              el.optBoolean("visible", true),
              (float) el.optDouble("opacity", 1),
              text,
              parseColorHex(payload.optString("color", "#FFFFFF"), Color.WHITE),
              (float) payload.optDouble("fontSizeNorm", 0.045),
              payload.optString("align", "center"),
              payload.optString("weight", "bold"),
              null,
              null);
    } else {
      String mediaId = payload.optString("mediaId", "");
      if (mediaId.isEmpty()) {
        return new ParseResult(false, "IMAGE_MISSING_MEDIA", null);
      }
      String fit = payload.optString("fit", "CONTAIN");
      if (!"CONTAIN".equals(fit) && !"COVER".equals(fit)) {
        return new ParseResult(false, "BAD_IMAGE_FIT", null);
      }
      element =
          new Element(
              el.optString("id", ""),
              type,
              frame,
              el.optInt("zIndex", 0),
              el.optBoolean("visible", true),
              (float) el.optDouble("opacity", 1),
              null,
              Color.TRANSPARENT,
              0f,
              "center",
              "regular",
              mediaId,
              fit);
    }
    Scene scene =
        new Scene(
            "",
            1000,
            Color.BLACK,
            "CUT",
            0,
            Collections.singletonList(element));
    return new ParseResult(
        true,
        null,
        new DibayIntroPackModel(
            "", "", "", 9, 16, Collections.singletonList(scene), Collections.emptyMap()));
  }

  static int parseColorHex(String hex, int fallback) {
    if (hex == null || hex.isEmpty()) return fallback;
    try {
      String h = hex.trim();
      if (h.startsWith("#")) h = h.substring(1);
      if (h.length() == 6) {
        return 0xFF000000 | Integer.parseInt(h, 16);
      }
      if (h.length() == 8) {
        return (int) Long.parseLong(h, 16);
      }
    } catch (Exception ignored) {
      /* fallback */
    }
    return fallback;
  }

  /** Canonical JSON with sorted object keys — matches lib/intro/integrity.ts JSON.stringify(sortKeys). */
  public static String canonicalize(Object value) throws Exception {
    if (value == null || value == JSONObject.NULL) {
      return "null";
    }
    if (value instanceof JSONObject) {
      JSONObject obj = (JSONObject) value;
      TreeMap<String, Object> sorted = new TreeMap<>();
      Iterator<String> keys = obj.keys();
      while (keys.hasNext()) {
        String k = keys.next();
        sorted.put(k, obj.get(k));
      }
      StringBuilder sb = new StringBuilder();
      sb.append('{');
      boolean first = true;
      for (String k : sorted.keySet()) {
        if (!first) sb.append(',');
        first = false;
        sb.append(jsonStringLiteral(k));
        sb.append(':');
        sb.append(canonicalize(sorted.get(k)));
      }
      sb.append('}');
      return sb.toString();
    }
    if (value instanceof JSONArray) {
      JSONArray arr = (JSONArray) value;
      StringBuilder sb = new StringBuilder();
      sb.append('[');
      for (int i = 0; i < arr.length(); i++) {
        if (i > 0) sb.append(',');
        sb.append(canonicalize(arr.get(i)));
      }
      sb.append(']');
      return sb.toString();
    }
    if (value instanceof String) {
      return jsonStringLiteral((String) value);
    }
    if (value instanceof Boolean) {
      return ((Boolean) value) ? "true" : "false";
    }
    if (value instanceof Number) {
      // Match JSON.stringify number formatting (no scientific for our authored values).
      return numberLiteral((Number) value);
    }
    return jsonStringLiteral(String.valueOf(value));
  }

  /**
   * ECMAScript JSON.stringify string quoting — does NOT escape solidus `/`.
   * Android JSONObject.quote escapes `/` as `\/`, which breaks pack integrity.
   */
  static String jsonStringLiteral(String s) {
    StringBuilder sb = new StringBuilder(s.length() + 2);
    sb.append('"');
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"':
          sb.append("\\\"");
          break;
        case '\\':
          sb.append("\\\\");
          break;
        case '\b':
          sb.append("\\b");
          break;
        case '\f':
          sb.append("\\f");
          break;
        case '\n':
          sb.append("\\n");
          break;
        case '\r':
          sb.append("\\r");
          break;
        case '\t':
          sb.append("\\t");
          break;
        default:
          if (c < 0x20) {
            sb.append(String.format("\\u%04x", (int) c));
          } else {
            sb.append(c);
          }
      }
    }
    sb.append('"');
    return sb.toString();
  }

  static String numberLiteral(Number n) {
    if (n instanceof Double || n instanceof Float) {
      double d = n.doubleValue();
      if (d == Math.rint(d) && !Double.isInfinite(d)) {
        return Long.toString((long) d);
      }
      // Double.toString matches JS for our authored normalized geometry.
      return Double.toString(d);
    }
    return n.toString();
  }

  public static String sha256Hex(byte[] bytes) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    byte[] dig = md.digest(bytes);
    StringBuilder sb = new StringBuilder(dig.length * 2);
    for (byte b : dig) {
      sb.append(String.format("%02x", b));
    }
    return sb.toString();
  }
}
