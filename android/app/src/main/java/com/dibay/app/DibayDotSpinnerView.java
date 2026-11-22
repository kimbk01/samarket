package com.dibay.app;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;
import android.view.animation.LinearInterpolator;

/**
 * DIBAY 로딩 스피너 — 웹 단일 정의(`app/samarket-components.css` `.sam-spinner`)와 같은 12점 링.
 * 설계 `docs/audit/loading-spinner-network-notice-design-2026-11-22.md` §3-5 W7.
 *
 * <p>점 지름 = 크기 × 0.145 · 반지름 = 크기 × 0.38 · 한 바퀴 1.15s · 점마다 1.15s/12 늦게 켜짐(시계방향).
 * 밝기 0.25 → 1(10%) → 0.4(30%) → 0.25 — 웹 keyframes `sam-spinner-dot` 과 같은 곡선. 크기 비율(0.6→1→0.75)도 같다.
 */
final class DibayDotSpinnerView extends View {
  static final int DOTS = 12;
  static final long CYCLE_MS = 1150L;

  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private ValueAnimator animator;
  private float phase = 0f;

  DibayDotSpinnerView(Context context, int color) {
    super(context);
    paint.setColor(color);
    paint.setStyle(Paint.Style.FILL);
    setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
  }

  void start() {
    if (animator != null) return;
    animator = ValueAnimator.ofFloat(0f, 1f);
    animator.setDuration(CYCLE_MS);
    animator.setRepeatCount(ValueAnimator.INFINITE);
    animator.setInterpolator(new LinearInterpolator());
    animator.addUpdateListener(
        a -> {
          phase = (float) a.getAnimatedValue();
          invalidate();
        });
    animator.start();
  }

  void stop() {
    if (animator != null) {
      animator.cancel();
      animator = null;
    }
  }

  @Override
  protected void onDetachedFromWindow() {
    stop();
    super.onDetachedFromWindow();
  }

  /** 웹 keyframes 와 같은 구간 선형 보간 — t = 이 점의 주기 안 위치(0~1) */
  static float[] dotOpacityScale(float t) {
    if (t < 0.10f) return new float[] {lerp(0.25f, 1f, t / 0.10f), lerp(0.6f, 1f, t / 0.10f)};
    if (t < 0.30f) {
      float k = (t - 0.10f) / 0.20f;
      return new float[] {lerp(1f, 0.4f, k), lerp(1f, 0.75f, k)};
    }
    float k = (t - 0.30f) / 0.70f;
    return new float[] {lerp(0.4f, 0.25f, k), lerp(0.75f, 0.6f, k)};
  }

  private static float lerp(float a, float b, float k) {
    return a + (b - a) * Math.max(0f, Math.min(1f, k));
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    float size = Math.min(getWidth(), getHeight());
    if (size <= 0) return;
    float cx = getWidth() / 2f;
    float cy = getHeight() / 2f;
    float dot = size * 0.145f;
    float radius = size * 0.38f;
    int baseAlpha = paint.getAlpha();
    for (int i = 0; i < DOTS; i++) {
      // 웹: 점 i 의 animation-delay = i × 1.15s/12 → 주기 안 위치 = phase - i/12
      float t = phase - (float) i / DOTS;
      t = t - (float) Math.floor(t);
      float[] os = dotOpacityScale(t);
      double angle = Math.toRadians(i * (360.0 / DOTS)) - Math.PI / 2.0;
      float x = cx + (float) (radius * Math.cos(angle));
      float y = cy + (float) (radius * Math.sin(angle));
      paint.setAlpha(Math.round(255 * os[0]));
      canvas.drawCircle(x, y, (dot / 2f) * os[1], paint);
    }
    paint.setAlpha(baseAlpha);
  }
}
