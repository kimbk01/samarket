package com.dibay.app.intro;

import android.graphics.Color;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Parses canonical local Active Pack JSON into renderable scene model.
 * Does not hardcode Scene1 content. Unsupported layer types → fail (no silent omit).
 */
public final class DibayIntroPackModel {
  public final String packId;
  public final String publishedRevisionId;
  public final String packIntegrity;
  public final float compositionW;
  public final float compositionH;
  public final List<Scene> scenes;
  public final Map<String, Asset> assetsByMediaRef;

  public DibayIntroPackModel(
      String packId,
      String publishedRevisionId,
      String packIntegrity,
      float compositionW,
      float compositionH,
      List<Scene> scenes,
      Map<String, Asset> assetsByMediaRef) {
    this.packId = packId;
    this.publishedRevisionId = publishedRevisionId;
    this.packIntegrity = packIntegrity;
    this.compositionW = compositionW;
    this.compositionH = compositionH;
    this.scenes = scenes;
    this.assetsByMediaRef = assetsByMediaRef;
  }

  public static final class Asset {
    public final String sealedAssetId;
    public final String sealedIntegrity;
    public final String relativePackPath;
    public final String mediaRefId;
    public final String mime;

    public Asset(
        String sealedAssetId,
        String sealedIntegrity,
        String relativePackPath,
        String mediaRefId,
        String mime) {
      this.sealedAssetId = sealedAssetId;
      this.sealedIntegrity = sealedIntegrity;
      this.relativePackPath = relativePackPath;
      this.mediaRefId = mediaRefId;
      this.mime = mime;
    }
  }

  public static final class Frame {
    public final float x;
    public final float y;
    public final float w;
    public final float h;

    public Frame(float x, float y, float w, float h) {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
    }
  }

  public static final class Layer {
    public final String layerId;
    public final String type;
    public final Frame frame;
    public final boolean visible;
    public final float opacity;
    public final int zIndex;
    public final String mediaRefId;
    public final String fit;
    public final String surface;
    public final String textContent;
    public final String fontAssetId;
    public final float fontSize;
    public final float lineHeight;
    public final int maxLines;
    public final String align;
    public final int colorArgb;
    public final String ctaLabel;
    public final String ctaActionType;
    public final int ctaBgArgb;
    public final float ctaCornerRadius;
    /** Semantic motion — NONE when legacy pack omits field. */
    public final String motionType;
    public final int motionStartMs;
    public final int motionDurationMs;

    public Layer(
        String layerId,
        String type,
        Frame frame,
        boolean visible,
        float opacity,
        int zIndex,
        String mediaRefId,
        String fit,
        String surface,
        String textContent,
        String fontAssetId,
        float fontSize,
        float lineHeight,
        int maxLines,
        String align,
        int colorArgb,
        String ctaLabel,
        String ctaActionType,
        int ctaBgArgb,
        float ctaCornerRadius,
        String motionType,
        int motionStartMs,
        int motionDurationMs) {
      this.layerId = layerId;
      this.type = type;
      this.frame = frame;
      this.visible = visible;
      this.opacity = opacity;
      this.zIndex = zIndex;
      this.mediaRefId = mediaRefId;
      this.fit = fit;
      this.surface = surface;
      this.textContent = textContent;
      this.fontAssetId = fontAssetId;
      this.fontSize = fontSize;
      this.lineHeight = lineHeight;
      this.maxLines = maxLines;
      this.align = align;
      this.colorArgb = colorArgb;
      this.ctaLabel = ctaLabel;
      this.ctaActionType = ctaActionType;
      this.ctaBgArgb = ctaBgArgb;
      this.ctaCornerRadius = ctaCornerRadius;
      this.motionType = motionType != null ? motionType : "NONE";
      this.motionStartMs = Math.max(0, motionStartMs);
      this.motionDurationMs = Math.max(0, motionDurationMs);
    }
  }

  public static final class Transition {
    public final String type;
    public final int durationMs;

    public Transition(String type, int durationMs) {
      this.type = type;
      this.durationMs = durationMs;
    }
  }

  public static final class Scene {
    public final String sceneId;
    public final String name;
    public final int durationMs;
    public final int backgroundArgb;
    public final Transition transitionAfter;
    public final List<Layer> layers;

    public Scene(
        String sceneId,
        String name,
        int durationMs,
        int backgroundArgb,
        Transition transitionAfter,
        List<Layer> layers) {
      this.sceneId = sceneId;
      this.name = name;
      this.durationMs = durationMs;
      this.backgroundArgb = backgroundArgb;
      this.transitionAfter = transitionAfter;
      this.layers = layers;
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
    byte[] bytes = readAll(packFile);
    JSONObject root = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
    String embedded = root.optString("packIntegrity", "");
    if (expectedIntegrity != null
        && !expectedIntegrity.isEmpty()
        && !expectedIntegrity.equals(embedded)) {
      return new ParseResult(false, "PACK_INTEGRITY_MISMATCH", null);
    }
    return parseRoot(root, embedded.isEmpty() ? expectedIntegrity : embedded);
  }

  public static ParseResult parseRoot(JSONObject root, String packIntegrity) throws Exception {
    String packId = root.optString("packId", "");
    String publishedRevisionId = root.optString("publishedRevisionId", "");
    JSONObject document = root.optJSONObject("document");
    if (document == null) {
      return new ParseResult(false, "PACK_MISSING_DOCUMENT", null);
    }
    JSONObject settings = document.optJSONObject("settings");
    float CaW = 9f;
    float CaH = 16f;
    if (settings != null) {
      JSONObject aspect = settings.optJSONObject("compositionAspect");
      if (aspect != null) {
        CaW = (float) aspect.optDouble("w", 9);
        CaH = (float) aspect.optDouble("h", 16);
      }
    }

    Map<String, Asset> assets = new HashMap<>();
    JSONArray assetArr = root.optJSONArray("assets");
    if (assetArr != null) {
      for (int i = 0; i < assetArr.length(); i++) {
        JSONObject a = assetArr.getJSONObject(i);
        Asset asset =
            new Asset(
                a.optString("sealedAssetId", ""),
                a.optString("sealedIntegrity", ""),
                a.optString("relativePackPath", ""),
                a.optString("mediaRefId", ""),
                a.optString("mime", ""));
        if (!asset.mediaRefId.isEmpty()) {
          assets.put(asset.mediaRefId, asset);
        }
      }
    }

    JSONArray sceneArr = document.optJSONArray("scenes");
    if (sceneArr == null || sceneArr.length() == 0) {
      return new ParseResult(false, "PACK_NO_SCENES", null);
    }
    List<Scene> scenes = new ArrayList<>();
    for (int i = 0; i < sceneArr.length(); i++) {
      JSONObject s = sceneArr.getJSONObject(i);
      ParseResult sceneParse = parseScene(s, assets);
      if (!sceneParse.ok) return sceneParse;
      scenes.add(sceneParse.model.scenes.get(0));
    }

    DibayIntroPackModel model =
        new DibayIntroPackModel(
            packId,
            publishedRevisionId,
            packIntegrity != null ? packIntegrity : root.optString("packIntegrity", ""),
            CaW,
            CaH,
            Collections.unmodifiableList(scenes),
            Collections.unmodifiableMap(assets));
    return new ParseResult(true, null, model);
  }

  private static ParseResult parseScene(JSONObject s, Map<String, Asset> assets)
      throws Exception {
    String sceneId = s.optString("sceneId", "");
    String name = s.optString("name", "");
    int durationMs = s.optInt("durationMs", 0);
    JSONObject bg = s.optJSONObject("background");
    int bgArgb = Color.BLACK;
    if (bg != null) {
      if (!"SOLID".equals(bg.optString("type", ""))) {
        return new ParseResult(false, "UNSUPPORTED_BACKGROUND:" + bg.optString("type"), null);
      }
      bgArgb = colorToArgb(bg.opt("color"), Color.BLACK);
    }
    Transition transition = null;
    if (!s.isNull("transitionAfter") && s.optJSONObject("transitionAfter") != null) {
      JSONObject t = s.getJSONObject("transitionAfter");
      String type = t.optString("type", "");
      if (!"CUT".equals(type) && !"FADE".equals(type) && !"SLIDE".equals(type)) {
        return new ParseResult(false, "UNSUPPORTED_TRANSITION:" + type, null);
      }
      transition = new Transition(type, t.optInt("durationMs", 0));
    }
    List<Layer> layers = new ArrayList<>();
    JSONArray layerArr = s.optJSONArray("layers");
    if (layerArr != null) {
      for (int i = 0; i < layerArr.length(); i++) {
        ParseResult lr = parseLayer(layerArr.getJSONObject(i), assets);
        if (!lr.ok) return lr;
        layers.add(lr.model.scenes.get(0).layers.get(0));
      }
    }
    layers.sort(Comparator.comparingInt(l -> l.zIndex));
    Scene scene =
        new Scene(
            sceneId,
            name,
            durationMs,
            bgArgb,
            transition,
            Collections.unmodifiableList(layers));
    DibayIntroPackModel stub =
        new DibayIntroPackModel("", "", "", 9, 16, Collections.singletonList(scene), assets);
    return new ParseResult(true, null, stub);
  }

  private static ParseResult parseLayer(JSONObject l, Map<String, Asset> assets)
      throws Exception {
    String type = l.optString("type", "");
    if (!"IMAGE".equals(type)
        && !"LOGO".equals(type)
        && !"TEXT".equals(type)
        && !"CTA".equals(type)) {
      return new ParseResult(false, "UNSUPPORTED_LAYER:" + type, null);
    }
    JSONObject frameJson = l.optJSONObject("frame");
    if (frameJson == null) {
      return new ParseResult(false, "LAYER_MISSING_FRAME", null);
    }
    Frame frame =
        new Frame(
            (float) frameJson.optDouble("x", 0),
            (float) frameJson.optDouble("y", 0),
            (float) frameJson.optDouble("w", 0),
            (float) frameJson.optDouble("h", 0));
    boolean visible = l.optBoolean("visible", true);
    float opacity = (float) l.optDouble("opacity", 1);
    int zIndex = l.optInt("zIndex", 0);
    String mediaRefId = l.optString("mediaRefId", null);
    String fit = l.optString("fit", "CONTAIN");
    String surface = l.optString("surface", "CONTENT");
    String textContent = null;
    String fontAssetId = null;
    float fontSize = 0.05f;
    float lineHeight = 1.25f;
    int maxLines = 2;
    String align = "CENTER";
    int colorArgb = Color.WHITE;
    String ctaLabel = null;
    String ctaActionType = null;
    int ctaBgArgb = Color.TRANSPARENT;
    float ctaCornerRadius = 0f;
    String motionType = "NONE";
    int motionStartMs = 0;
    int motionDurationMs = 0;

    JSONObject motionJson = l.optJSONObject("motion");
    if (motionJson != null) {
      motionType = motionJson.optString("type", "NONE");
      if (motionType == null || motionType.isEmpty()) motionType = "NONE";
      motionStartMs = Math.max(0, motionJson.optInt("startMs", 0));
      motionDurationMs = Math.max(0, motionJson.optInt("durationMs", 0));
      if ("NONE".equals(motionType)) {
        motionStartMs = 0;
        motionDurationMs = 0;
      }
    }

    if ("IMAGE".equals(type) || "LOGO".equals(type)) {
      if (mediaRefId == null || mediaRefId.isEmpty()) {
        return new ParseResult(false, "LAYER_MISSING_MEDIA:" + type, null);
      }
      if (!assets.containsKey(mediaRefId)) {
        return new ParseResult(false, "LAYER_MEDIA_NOT_IN_PACK:" + mediaRefId, null);
      }
    }
    if ("TEXT".equals(type)) {
      textContent = l.optString("content", "");
      JSONObject font = l.optJSONObject("font");
      if (font == null) {
        return new ParseResult(false, "TEXT_MISSING_FONT", null);
      }
      if (!"Pretendard".equals(font.optString("family", ""))) {
        return new ParseResult(false, "TEXT_NON_PRETENDARD", null);
      }
      fontAssetId = font.optString("assetId", "");
      fontSize = (float) l.optDouble("fontSize", 0.05);
      lineHeight = (float) l.optDouble("lineHeight", 1.25);
      maxLines = l.optInt("maxLines", 2);
      align = l.optString("align", "CENTER");
      colorArgb = colorToArgb(l.opt("color"), Color.WHITE);
    }
    if ("CTA".equals(type)) {
      ctaLabel = l.optString("label", "");
      JSONObject action = l.optJSONObject("action");
      ctaActionType = action != null ? action.optString("type", "") : "";
      JSONObject text = l.optJSONObject("text");
      if (text != null) {
        JSONObject font = text.optJSONObject("font");
        if (font != null) {
          fontAssetId = font.optString("assetId", "");
        }
        fontSize = (float) text.optDouble("fontSize", 0.035);
        align = text.optString("align", "CENTER");
        colorArgb = colorToArgb(text.opt("color"), Color.WHITE);
      }
      JSONObject bg = l.optJSONObject("background");
      if (bg != null) {
        ctaBgArgb = colorToArgb(bg.opt("color"), Color.TRANSPARENT);
        ctaCornerRadius = (float) bg.optDouble("cornerRadius", 0);
      }
    }

    Layer layer =
        new Layer(
            l.optString("layerId", ""),
            type,
            frame,
            visible,
            opacity,
            zIndex,
            mediaRefId,
            fit,
            surface,
            textContent,
            fontAssetId,
            fontSize,
            lineHeight,
            maxLines,
            align,
            colorArgb,
            ctaLabel,
            ctaActionType,
            ctaBgArgb,
            ctaCornerRadius,
            motionType,
            motionStartMs,
            motionDurationMs);
    Scene stubScene =
        new Scene("", "", 0, Color.BLACK, null, Collections.singletonList(layer));
    DibayIntroPackModel stub =
        new DibayIntroPackModel("", "", "", 9, 16, Collections.singletonList(stubScene), assets);
    return new ParseResult(true, null, stub);
  }

  public static int colorToArgb(Object color, int fallback) {
    if (color instanceof JSONObject) {
      JSONObject c = (JSONObject) color;
      int a = Math.round((float) c.optDouble("a", 1) * 255f);
      int r = Math.round((float) c.optDouble("r", 0) * 255f);
      int g = Math.round((float) c.optDouble("g", 0) * 255f);
      int b = Math.round((float) c.optDouble("b", 0) * 255f);
      return Color.argb(clamp255(a), clamp255(r), clamp255(g), clamp255(b));
    }
    if (color instanceof String) {
      try {
        return Color.parseColor((String) color);
      } catch (Exception ignored) {
        return fallback;
      }
    }
    return fallback;
  }

  private static int clamp255(int v) {
    return Math.max(0, Math.min(255, v));
  }

  public static boolean verifyAssetFile(File file, String sealedIntegrity) throws Exception {
    if (file == null || !file.isFile()) return false;
    String hex = sha256Hex(readAll(file));
    String expected =
        sealedIntegrity != null && sealedIntegrity.startsWith("sha256:")
            ? sealedIntegrity.substring("sha256:".length())
            : sealedIntegrity;
    return expected != null && expected.equalsIgnoreCase(hex);
  }

  private static byte[] readAll(File f) throws Exception {
    java.io.FileInputStream in = new java.io.FileInputStream(f);
    try {
      java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
      byte[] buf = new byte[8192];
      int n;
      while ((n = in.read(buf)) >= 0) bos.write(buf, 0, n);
      return bos.toByteArray();
    } finally {
      in.close();
    }
  }

  private static String sha256Hex(byte[] bytes) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    byte[] dig = md.digest(bytes);
    StringBuilder sb = new StringBuilder(dig.length * 2);
    for (byte b : dig) sb.append(String.format("%02x", b));
    return sb.toString();
  }
}
