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
    public final String ctaLabel;
    public final String ctaActionType;
    public final String ctaDestination;
    public final int ctaBgArgb;
    public final int ctaTextArgb;
    public final String motionType;
    public final int motionStartMs;
    public final int motionDurationMs;

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
        String fit,
        String ctaLabel,
        String ctaActionType,
        String ctaDestination,
        int ctaBgArgb,
        int ctaTextArgb,
        String motionType,
        int motionStartMs,
        int motionDurationMs) {
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
      this.ctaLabel = ctaLabel;
      this.ctaActionType = ctaActionType;
      this.ctaDestination = ctaDestination;
      this.ctaBgArgb = ctaBgArgb;
      this.ctaTextArgb = ctaTextArgb;
      this.motionType = motionType != null ? motionType : "NONE";
      this.motionStartMs = motionStartMs;
      this.motionDurationMs = motionDurationMs;
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
    public final String backgroundMediaId;
    public final String backgroundFit;
    /** Flat SSOT: CUT, FADE, SLIDE_LEFT, SLIDE_RIGHT, SLIDE_UP, SLIDE_DOWN. */
    public final String transitionType;
    public final int transitionDurationMs;
    /** LEFT, RIGHT, UP, DOWN when transition is SLIDE_*; otherwise null. */
    public final String slideDirection;
    public final List<Element> elements;

    public Scene(
        String id,
        int durationMs,
        int backgroundArgb,
        String backgroundMediaId,
        String backgroundFit,
        String transitionType,
        int transitionDurationMs,
        String slideDirection,
        List<Element> elements) {
      this.id = id;
      this.durationMs = durationMs;
      this.backgroundArgb = backgroundArgb;
      this.backgroundMediaId = backgroundMediaId;
      this.backgroundFit = backgroundFit;
      this.transitionType = transitionType;
      this.transitionDurationMs = transitionDurationMs;
      this.slideDirection = slideDirection;
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
    String bgMediaId = null;
    String bgFit = null;
    if (bg != null) {
      String bgType = bg.optString("type", "");
      if ("COLOR".equals(bgType)) {
        bgArgb = parseColorHex(bg.optString("color", "#000000"), Color.BLACK);
      } else if ("IMAGE".equals(bgType)) {
        bgMediaId = bg.optString("mediaId", "");
        if (bgMediaId.isEmpty()) {
          return new ParseResult(false, "BACKGROUND_IMAGE_MISSING_MEDIA", null);
        }
        bgFit = bg.optString("fit", "COVER");
        if (!"CONTAIN".equals(bgFit) && !"COVER".equals(bgFit)) {
          return new ParseResult(false, "BACKGROUND_IMAGE_BAD_FIT:" + bgFit, null);
        }
        if (bg.has("color")) {
          bgArgb = parseColorHex(bg.optString("color", "#000000"), Color.BLACK);
        }
      } else {
        return new ParseResult(false, "UNSUPPORTED_BACKGROUND:" + bgType, null);
      }
    }
    JSONObject tr = s.optJSONObject("transition");
    TransitionFields trFields = parseTransitionFields(tr);
    if (trFields.error != null) {
      return new ParseResult(false, trFields.error, null);
    }
    String trType = trFields.type;
    int trMs = trFields.durationMs;
    String slideDirection = trFields.slideDirection;
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
            bgMediaId,
            bgFit,
            trType,
            trMs,
            slideDirection,
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
    if (!"TEXT".equals(type)
        && !"IMAGE".equals(type)
        && !"LOGO".equals(type)
        && !"VIDEO".equals(type)
        && !"CTA".equals(type)) {
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
    JSONObject motion = el.optJSONObject("motion");
    String motionType = "NONE";
    int motionStartMs = 0;
    int motionDurationMs = 0;
    if (motion != null) {
      motionType = normalizeMotionType(motion.optString("type", "NONE"));
      motionStartMs = motion.optInt("startMs", 0);
      motionDurationMs = motion.optInt("durationMs", 0);
      if (!isCanonicalMotionType(motionType)) {
        motionType = "NONE";
        motionDurationMs = 0;
      }
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
              null,
              null,
              null,
              null,
              Color.TRANSPARENT,
              Color.TRANSPARENT,
              motionType,
              motionStartMs,
              motionDurationMs);
    } else if ("CTA".equals(type)) {
      String label = payload.optString("label", "");
      if (label.trim().isEmpty()) {
        return new ParseResult(false, "EMPTY_CTA_LABEL", null);
      }
      JSONObject action = payload.optJSONObject("action");
      if (action == null) {
        return new ParseResult(false, "CTA_MISSING_ACTION", null);
      }
      String actionType = action.optString("type", "");
      if (!"NEXT_SCENE".equals(actionType)
          && !"FINISH_INTRO".equals(actionType)
          && !"INTERNAL_DESTINATION".equals(actionType)) {
        return new ParseResult(false, "CTA_BAD_ACTION:" + actionType, null);
      }
      String destination = action.optString("destination", "");
      if ("INTERNAL_DESTINATION".equals(actionType) && destination.isEmpty()) {
        return new ParseResult(false, "CTA_MISSING_DESTINATION", null);
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
              "bold",
              null,
              null,
              label,
              actionType,
              destination,
              parseColorHex(payload.optString("backgroundColor", "#4F46E5"), 0xFF4F46E5),
              parseColorHex(payload.optString("textColor", "#FFFFFF"), Color.WHITE),
              motionType,
              motionStartMs,
              motionDurationMs);
    } else {
      // IMAGE / LOGO / VIDEO — same mediaId + fit payload.
      String mediaId = payload.optString("mediaId", "");
      if (mediaId.isEmpty()) {
        return new ParseResult(
            false,
            "VIDEO".equals(type) ? "VIDEO_MISSING_MEDIA" : "IMAGE_MISSING_MEDIA",
            null);
      }
      String fit = payload.optString("fit", "CONTAIN");
      if (!"CONTAIN".equals(fit) && !"COVER".equals(fit)) {
        return new ParseResult(
            false, "VIDEO".equals(type) ? "BAD_VIDEO_FIT" : "BAD_IMAGE_FIT", null);
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
              fit,
              null,
              null,
              null,
              Color.TRANSPARENT,
              Color.TRANSPARENT,
              motionType,
              motionStartMs,
              motionDurationMs);
    }
    Scene scene =
        new Scene(
            "",
            1000,
            Color.BLACK,
            null,
            null,
            "CUT",
            0,
            null,
            Collections.singletonList(element));
    return new ParseResult(
        true,
        null,
        new DibayIntroPackModel(
            "", "", "", 9, 16, Collections.singletonList(scene), Collections.emptyMap()));
  }

  private static final class TransitionFields {
    String type = "CUT";
    int durationMs = 0;
    String slideDirection = null;
    String error = null;
  }

  /** Flat TransitionV1 + legacy { type: SLIDE, direction }. */
  private static TransitionFields parseTransitionFields(JSONObject tr) {
    TransitionFields out = new TransitionFields();
    if (tr == null) {
      return out;
    }
    String rawType = tr.optString("type", "CUT");
    int durationMs = tr.optInt("durationMs", 0);
    if ("SLIDE".equals(rawType)) {
      String dir = tr.optString("direction", "DOWN");
      if (!isSlideAxis(dir)) {
        out.error = "UNSUPPORTED_TRANSITION_DIRECTION:" + dir;
        return out;
      }
      out.type = "SLIDE_" + dir;
      out.slideDirection = dir;
      out.durationMs = durationMs;
      return out;
    }
    if ("CUT".equals(rawType)) {
      out.type = "CUT";
      out.durationMs = 0;
      return out;
    }
    if ("FADE".equals(rawType)) {
      out.type = "FADE";
      out.durationMs = durationMs;
      return out;
    }
    if (rawType.startsWith("SLIDE_")) {
      String axis = rawType.substring("SLIDE_".length());
      if (!isSlideAxis(axis)) {
        out.error = "UNSUPPORTED_TRANSITION:" + rawType;
        return out;
      }
      out.type = rawType;
      out.slideDirection = axis;
      out.durationMs = durationMs;
      return out;
    }
    out.error = "UNSUPPORTED_TRANSITION:" + rawType;
    return out;
  }

  private static boolean isSlideAxis(String dir) {
    return "LEFT".equals(dir)
        || "RIGHT".equals(dir)
        || "UP".equals(dir)
        || "DOWN".equals(dir);
  }

  /** Matches lib/intro/contracts/capability-registry.ts MOTION_NORMALIZATION_MAP. */
  static String normalizeMotionType(String raw) {
    if (raw == null || raw.isEmpty()) {
      return "NONE";
    }
    switch (raw) {
      case "ENTER_TOP":
        return "ENTER_UP";
      case "ENTER_BOTTOM":
        return "ENTER_DOWN";
      case "SLIDE_LEFT":
      case "SLIDE_IN_LEFT":
        return "ENTER_LEFT";
      case "SLIDE_RIGHT":
      case "SLIDE_IN_RIGHT":
        return "ENTER_RIGHT";
      case "SLIDE_UP":
      case "SLIDE_IN_UP":
        return "ENTER_UP";
      case "SLIDE_DOWN":
      case "SLIDE_IN_DOWN":
        return "ENTER_DOWN";
      default:
        return raw;
    }
  }

  private static boolean isCanonicalMotionType(String type) {
    return "NONE".equals(type)
        || "FADE_IN".equals(type)
        || "ENTER_LEFT".equals(type)
        || "ENTER_RIGHT".equals(type)
        || "ENTER_UP".equals(type)
        || "ENTER_DOWN".equals(type)
        || "SCALE_IN".equals(type);
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
