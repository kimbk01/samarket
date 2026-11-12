package com.dibay.app.nativevideo;

import android.animation.ArgbEvaluator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.os.Build;
import android.util.AttributeSet;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;

/**
 * 영상 통화 신호 테두리 — 화면 네 가장자리에서 안쪽으로 은은하게 번지는 빛(선 아님).
 *
 * <p>좋음 = 테두리 없음(Owner 2026-11-12 「정상일 때 안 나오게, 나쁨·아주 나쁨만」) · 나쁨 = 황색(「나쁨」 신호 색) 고정 · 아주 나쁨 =
 * 적색(통화 종료 버튼 색) 1초 주기 깜빡임.
 * 색 바뀜 0.3초 교차 전환. 기기 애니메이션 끔이면 깜빡이지 않고 적색 고정. 터치를 받지 않는다.
 *
 * <p>설계·시안: docs/audit/call-video-chrome-signal-border-design-2026-11-12.md D5.
 */
public final class CallSignalEdgeView extends View {
  static final int COLOR_POOR = Color.parseColor("#F5C26B");
  static final int COLOR_VERY_POOR = Color.parseColor("#D93025");
  static final float EDGE_ALPHA_POOR = 0.7f;
  static final float EDGE_ALPHA_VERY_POOR = 0.85f;
  static final float BLINK_LOW_FACTOR = 0.2f / 0.85f;
  static final long BLINK_HALF_PERIOD_MS = 500L;
  static final long COLOR_CROSSFADE_MS = 300L;
  /** 번짐 폭 — Owner 2026-11-12 「너비 줄여」 70dp → 40dp. */
  static final float GLOW_DEPTH_DP = 40f;

  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final float depthPx;
  private NativeVideoNetworkTier.Tier tier;
  /** 가장자리 색(불투명도 포함). */
  private int edgeColor = Color.TRANSPARENT;
  private float blinkFactor = 1f;
  private ValueAnimator colorAnimator;
  private ValueAnimator blinkAnimator;
  private boolean active;
  private final Shader[] shaders = new Shader[4];
  private int shaderKeyColor;
  private int shaderKeyW;
  private int shaderKeyH;
  private float shaderDepth;

  public CallSignalEdgeView(Context context) {
    this(context, null);
  }

  public CallSignalEdgeView(Context context, AttributeSet attrs) {
    super(context, attrs);
    depthPx = GLOW_DEPTH_DP * context.getResources().getDisplayMetrics().density;
    setClickable(false);
    setFocusable(false);
    setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    setWillNotDraw(false);
  }

  /** 연결·전체 화면일 때만 true. false 면 숨기고 깜빡임을 멈춘다. */
  public void setActive(boolean nextActive) {
    if (active == nextActive) return;
    active = nextActive;
    setVisibility(active ? VISIBLE : GONE);
    syncBlink();
  }

  void setTier(NativeVideoNetworkTier.Tier nextTier, boolean animate) {
    if (nextTier == null || nextTier == tier) return;
    int target = edgeColorFor(nextTier);
    tier = nextTier;
    if (colorAnimator != null) colorAnimator.cancel();
    if (!animate || !animatorsEnabled() || (Color.alpha(edgeColor) == 0 && Color.alpha(target) == 0)) {
      edgeColor = target;
      invalidate();
    } else {
      // 없음 ↔ 색: 같은 색의 투명값과 오가야 중간에 검게 비치지 않는다.
      int from = Color.alpha(edgeColor) == 0 ? (target & 0x00FFFFFF) : edgeColor;
      int to = Color.alpha(target) == 0 ? (edgeColor & 0x00FFFFFF) : target;
      ValueAnimator anim = ValueAnimator.ofObject(new ArgbEvaluator(), from, to);
      anim.setDuration(COLOR_CROSSFADE_MS);
      anim.addUpdateListener(
          a -> {
            edgeColor = (int) a.getAnimatedValue();
            invalidate();
          });
      colorAnimator = anim;
      anim.start();
    }
    syncBlink();
  }

  static int edgeColorFor(NativeVideoNetworkTier.Tier t) {
    switch (t) {
      case VERY_POOR:
        return withAlpha(COLOR_VERY_POOR, EDGE_ALPHA_VERY_POOR);
      case POOR:
        return withAlpha(COLOR_POOR, EDGE_ALPHA_POOR);
      case GOOD:
      default:
        return Color.TRANSPARENT;
    }
  }

  private static int withAlpha(int color, float alpha) {
    return Color.argb(Math.round(alpha * 255f), Color.red(color), Color.green(color), Color.blue(color));
  }

  private static boolean animatorsEnabled() {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || ValueAnimator.areAnimatorsEnabled();
  }

  private void syncBlink() {
    boolean shouldBlink =
        active && tier == NativeVideoNetworkTier.Tier.VERY_POOR && animatorsEnabled() && isAttachedToWindow();
    if (shouldBlink) {
      if (blinkAnimator != null && blinkAnimator.isRunning()) return;
      ValueAnimator anim = ValueAnimator.ofFloat(1f, BLINK_LOW_FACTOR);
      anim.setDuration(BLINK_HALF_PERIOD_MS);
      anim.setRepeatMode(ValueAnimator.REVERSE);
      anim.setRepeatCount(ValueAnimator.INFINITE);
      anim.setInterpolator(new AccelerateDecelerateInterpolator());
      anim.addUpdateListener(
          a -> {
            blinkFactor = (float) a.getAnimatedValue();
            invalidate();
          });
      blinkAnimator = anim;
      anim.start();
    } else {
      if (blinkAnimator != null) blinkAnimator.cancel();
      blinkAnimator = null;
      if (blinkFactor != 1f) {
        blinkFactor = 1f;
        invalidate();
      }
    }
  }

  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    syncBlink();
  }

  @Override
  protected void onDetachedFromWindow() {
    if (colorAnimator != null) colorAnimator.cancel();
    if (blinkAnimator != null) blinkAnimator.cancel();
    blinkAnimator = null;
    super.onDetachedFromWindow();
  }

  @Override
  protected void onSizeChanged(int w, int h, int oldw, int oldh) {
    super.onSizeChanged(w, h, oldw, oldh);
    shaderKeyColor = 0;
  }

  /** 크기·색이 바뀔 때만 그라데이션을 다시 만든다(깜빡임은 Paint 불투명도로만 — 매 프레임 할당 없음). */
  private void ensureShaders(int w, int h) {
    if (shaderKeyColor == edgeColor && shaderKeyW == w && shaderKeyH == h && shaders[0] != null) return;
    float depth = Math.min(depthPx, Math.min(w, h) / 2f);
    int a = Color.alpha(edgeColor);
    int r = Color.red(edgeColor);
    int g = Color.green(edgeColor);
    int b = Color.blue(edgeColor);
    // 가장자리 → 안쪽: 진함 → 빠르게 옅어짐 → 0 (가우스 번짐에 가깝게)
    int[] colors = {
      Color.argb(a, r, g, b),
      Color.argb(Math.round(a * 0.45f), r, g, b),
      Color.argb(Math.round(a * 0.12f), r, g, b),
      Color.argb(0, r, g, b)
    };
    float[] stops = {0f, 0.3f, 0.65f, 1f};
    shaders[0] = new LinearGradient(0, 0, 0, depth, colors, stops, Shader.TileMode.CLAMP);
    shaders[1] = new LinearGradient(0, h, 0, h - depth, colors, stops, Shader.TileMode.CLAMP);
    shaders[2] = new LinearGradient(0, 0, depth, 0, colors, stops, Shader.TileMode.CLAMP);
    shaders[3] = new LinearGradient(w, 0, w - depth, 0, colors, stops, Shader.TileMode.CLAMP);
    shaderDepth = depth;
    shaderKeyColor = edgeColor;
    shaderKeyW = w;
    shaderKeyH = h;
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    int w = getWidth();
    int h = getHeight();
    if (w <= 0 || h <= 0 || Color.alpha(edgeColor) == 0) return;
    ensureShaders(w, h);
    float depth = shaderDepth;
    paint.setAlpha(Math.round(255f * blinkFactor));
    paint.setShader(shaders[0]);
    canvas.drawRect(0, 0, w, depth, paint);
    paint.setShader(shaders[1]);
    canvas.drawRect(0, h - depth, w, h, paint);
    paint.setShader(shaders[2]);
    canvas.drawRect(0, 0, depth, h, paint);
    paint.setShader(shaders[3]);
    canvas.drawRect(w - depth, 0, w, h, paint);
    paint.setShader(null);
  }
}
