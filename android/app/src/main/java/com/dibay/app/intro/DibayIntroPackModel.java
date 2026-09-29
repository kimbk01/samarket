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
import java.util.Iterator;
import java.util.List;
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

  public DibayIntroPackModel(
      String packageId,
      String releaseId,
      String packageIntegrity,
      float compositionW,
      float compositionH,
      List<Scene> scenes) {
    this.packageId = packageId;
    this.releaseId = releaseId;
    this.packageIntegrity = packageIntegrity;
    this.compositionW = compositionW;
    this.compositionH = compositionH;
    this.scenes = scenes;
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
        String weight) {
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
    // Verify canonical integrity of object without packageIntegrity
    JSONObject forHash = new JSONObject(root.toString());
    forHash.remove("packageIntegrity");
    String computed = sha256Hex(canonicalize(forHash).getBytes(StandardCharsets.UTF_8));
    if (!computed.equals(embedded)) {
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
            Collections.unmodifiableList(scenes)));
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
        // V0: IMAGE background not yet renderable — fail closed (no partial)
        return new ParseResult(false, "BACKGROUND_IMAGE_NOT_V0", null);
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
        new DibayIntroPackModel("", "", "", 9, 16, Collections.singletonList(scene));
    return new ParseResult(true, null, stub);
  }

  private static ParseResult parseElement(JSONObject el) throws Exception {
    String type = el.optString("type", "");
    // V0 supports TEXT only for elements; IMAGE/LOGO/CTA fail closed until vertical gates
    if ("IMAGE".equals(type) || "LOGO".equals(type) || "CTA".equals(type)) {
      return new ParseResult(false, "ELEMENT_NOT_V0:" + type, null);
    }
    if (!"TEXT".equals(type)) {
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
      return new ParseResult(false, "TEXT_MISSING_PAYLOAD", null);
    }
    String text = payload.optString("text", "");
    if (text.trim().isEmpty()) {
      return new ParseResult(false, "EMPTY_TEXT", null);
    }
    Element element =
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
            payload.optString("weight", "bold"));
    Scene scene =
        new Scene(
            "",
            1000,
            Color.BLACK,
            "CUT",
            0,
            Collections.singletonList(element));
    return new ParseResult(
        true, null, new DibayIntroPackModel("", "", "", 9, 16, Collections.singletonList(scene)));
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

  /** Canonical JSON with sorted object keys — matches lib/intro/integrity.ts */
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
        sb.append(JSONObject.quote(k));
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
      return JSONObject.quote((String) value);
    }
    if (value instanceof Number || value instanceof Boolean) {
      return JSONObject.wrap(value).toString();
    }
    return JSONObject.wrap(value).toString();
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
